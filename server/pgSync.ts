/**
 * Postgres mirror endpoint, served by the local Vite dev/preview server.
 *
 *   GET  /api/pg/status  → { ok, database, tables, views } or { ok: false, error }
 *   POST /api/pg/sync    → body { ops: SyncOp[] }, applied in one transaction
 *
 * Only same-origin JSON requests are accepted, so other sites open in the browser cannot write
 * to the mirror (a cross-site JSON POST needs a CORS preflight, which this endpoint never grants).
 */
import type { Plugin, Connect } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyOps, databaseUrl, getPool, type SyncOp } from './pg/sync'
import { TABLES, TRACKER_SCHEMA } from './pg/schema'

const MAX_BODY = 25 * 1024 * 1024

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true // same-origin fetches may omit it; cross-site POSTs always send it
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/** Database name only — never echo credentials from the URL. */
function dbLabel(): string {
  const u = new URL(databaseUrl())
  return `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}`
}

function errMessage(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e.code === 'ECONNREFUSED') return `Postgres is not running at ${dbLabel()}.`
  return e.message ?? String(err)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.byteLength
      if (size > MAX_BODY) {
        reject(new Error('Sync batch too large.'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const handler: Connect.NextHandleFunction = async (req, res, next) => {
  if (!req.url?.startsWith('/api/pg/')) return next()
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: 'Cross-origin requests are not allowed.' })

  if (req.method === 'GET' && req.url.startsWith('/api/pg/status')) {
    try {
      const pool = await getPool()
      const { rows } = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name`,
        [TRACKER_SCHEMA],
      )
      return send(res, 200, {
        ok: true,
        database: dbLabel(),
        tables: Object.values(TABLES).map((t) => t.pg),
        views: rows.map((r) => `${TRACKER_SCHEMA}.${r.table_name}`),
      })
    } catch (err) {
      return send(res, 503, { ok: false, error: errMessage(err) })
    }
  }

  if (req.method === 'POST' && req.url.startsWith('/api/pg/sync')) {
    if (!req.headers['content-type']?.startsWith('application/json')) {
      return send(res, 415, { ok: false, error: 'Expected application/json.' })
    }
    try {
      const { ops } = JSON.parse(await readBody(req)) as { ops?: SyncOp[] }
      if (!Array.isArray(ops)) return send(res, 400, { ok: false, error: 'Missing "ops".' })
      const pool = await getPool()
      const client = await pool.connect()
      try {
        const result = await applyOps(client, ops)
        return send(res, 200, { ok: true, ...result })
      } finally {
        client.release()
      }
    } catch (err) {
      return send(res, 500, { ok: false, error: errMessage(err) })
    }
  }

  return send(res, 404, { ok: false, error: 'Not found.' })
}

export function pgSyncPlugin(): Plugin {
  return {
    name: 'personal-hq-pg-sync',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
