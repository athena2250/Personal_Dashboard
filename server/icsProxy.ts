/**
 * Read-only ICS subscription proxy.
 *
 * Browsers cannot fetch iCloud public calendar feeds directly (no CORS headers), so this small
 * middleware runs inside the local Vite dev/preview server and fetches the feed server-side.
 *
 * Security properties:
 * - No credentials are accepted, stored, or forwarded. Only public "share calendar" links work.
 * - Only https (webcal:// is rewritten to https://) to hosts on an allowlist
 *   (default: *.icloud.com; extend with ICS_PROXY_ALLOWED_HOSTS="host1,.suffix2").
 * - Response size and time are capped, and the body must look like an iCalendar document.
 * - Feed URLs are never logged (they act as bearer links).
 */
import type { Plugin, Connect } from 'vite'
import type { ServerResponse } from 'node:http'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000
const DEFAULT_ALLOWED = ['.icloud.com']

export function allowedHosts(): string[] {
  const extra = (process.env.ICS_PROXY_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return [...DEFAULT_ALLOWED, ...extra]
}

export function normalizeFeedUrl(raw: string, allow: string[] = allowedHosts()): URL {
  let value = raw.trim()
  if (value.toLowerCase().startsWith('webcal://')) value = 'https://' + value.slice('webcal://'.length)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ProxyError(400, 'That is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new ProxyError(400, 'Only https:// or webcal:// feed URLs are supported.')
  if (url.username || url.password) throw new ProxyError(400, 'Feed URLs must not contain credentials.')
  const host = url.hostname.toLowerCase()
  const ok = allow.some((rule) => (rule.startsWith('.') ? host === rule.slice(1) || host.endsWith(rule) : host === rule))
  if (!ok) {
    throw new ProxyError(
      403,
      `Host "${host}" is not on the proxy allowlist. Add it with ICS_PROXY_ALLOWED_HOSTS if you trust it.`,
    )
  }
  return url
}

export class ProxyError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function fetchFeed(url: URL): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1', 'User-Agent': 'PersonalHQ-ICS/1.0' },
    })
    // Re-check the final host after redirects.
    normalizeFeedUrl(resp.url || url.toString())
    if (!resp.ok) throw new ProxyError(502, `Calendar server responded with HTTP ${resp.status}.`)
    const reader = resp.body?.getReader()
    if (!reader) throw new ProxyError(502, 'Empty response from calendar server.')
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) {
        controller.abort()
        throw new ProxyError(413, 'Calendar feed is larger than 5 MB.')
      }
      chunks.push(value)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new ProxyError(502, 'The URL did not return an iCalendar (.ics) feed.')
    return text
  } catch (err) {
    if (err instanceof ProxyError) throw err
    if ((err as Error).name === 'AbortError') throw new ProxyError(504, 'Timed out fetching the calendar feed.')
    throw new ProxyError(502, 'Could not reach the calendar server.')
  } finally {
    clearTimeout(timer)
  }
}

const handler: Connect.NextHandleFunction = (req, res, next) => {
  if (!req.url?.startsWith('/api/ics-proxy')) return next()
  if (req.method === 'GET' && req.url.startsWith('/api/ics-proxy/health')) {
    return send(res, 200, { ok: true, allowedHosts: allowedHosts() })
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })
  let raw = ''
  req.on('data', (c: Buffer) => {
    raw += c.toString('utf8')
    if (raw.length > 8192) req.destroy()
  })
  req.on('end', async () => {
    try {
      const { url } = JSON.parse(raw || '{}') as { url?: string }
      if (!url) throw new ProxyError(400, 'Missing "url".')
      const feedUrl = normalizeFeedUrl(url)
      const ics = await fetchFeed(feedUrl)
      send(res, 200, { ics, fetchedAt: new Date().toISOString() })
    } catch (err) {
      const status = err instanceof ProxyError ? err.status : 500
      const message = err instanceof ProxyError ? err.message : 'Unexpected proxy error.'
      send(res, status, { error: message })
    }
  })
}

export function icsProxyPlugin(): Plugin {
  return {
    name: 'personal-hq-ics-proxy',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
