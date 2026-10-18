/**
 * Calendar integration adapters.
 *
 * Supported (honestly):
 *  1. ICS file import  — one-off, events become editable local copies. Duplicates are prevented by UID.
 *  2. ICS file export  — download a .ics file and open it with Apple Calendar (adds events there).
 *  3. Subscription     — READ-ONLY. Fetches a *public* iCloud calendar link (webcal://p…icloud.com/…)
 *                        through the local proxy (server/icsProxy.ts) and mirrors it here.
 *
 * Not supported (by design): direct iCloud CalDAV read/write. iCloud CalDAV has no OAuth and needs
 * an Apple ID + app-specific password; storing that in a browser app is unsafe. A future secure
 * backend or native (EventKit) companion can implement `CalendarAdapter` for two-way sync.
 */
import type { CalendarEvent, CalendarSource } from '@/data/models'
import { db } from '@/data/db'
import { addSource, importParsedEvents, LOCAL_UID_SUFFIX, recordSourceError, type ImportResult } from '@/data/repos/events'
import { parseICS, serializeICS, type ExportEvent, type ParsedCalendar } from '@/domain/ics'
import { getAppTimezone } from '@/lib/tz'

export interface CalendarAdapter {
  id: string
  label: string
  direction: 'read-only' | 'export-only' | 'bidirectional'
  /** Pull events from the external calendar into the local DB. */
  pull?(source: CalendarSource): Promise<ImportResult>
}

export const FILE_SOURCE_NAME = 'ICS file imports'

export async function getOrCreateFileSource(): Promise<CalendarSource> {
  const existing = await db.calendarSources.filter((s) => s.kind === 'ics-file').first()
  if (existing) return existing
  return addSource({ name: FILE_SOURCE_NAME, kind: 'ics-file', color: '#64748b', autoRefreshMinutes: 0 })
}

export function previewICS(text: string): ParsedCalendar {
  return parseICS(text, getAppTimezone())
}

export async function importICSFile(text: string, category: string): Promise<ImportResult & { warnings: string[] }> {
  const parsed = previewICS(text)
  if (!parsed.events.length && parsed.warnings.length) throw new Error(parsed.warnings[0])
  const source = await getOrCreateFileSource()
  const res = await importParsedEvents(source, parsed.events, { category, mirror: false, readOnly: false })
  return { ...res, warnings: parsed.warnings }
}

export function toExportEvent(e: CalendarEvent, categoryName?: string): ExportEvent {
  return {
    uid: e.externalUid ?? `${e.id}${LOCAL_UID_SUFFIX}`,
    title: e.title,
    description: e.description,
    location: e.location,
    allDay: e.allDay,
    start: e.start,
    end: e.end,
    timezone: e.timezone,
    rrule: e.rrule,
    exdates: e.exdates,
    categories: categoryName ? [categoryName] : undefined,
    reminders: e.reminders,
    lastModified: e.updatedAt,
    created: e.createdAt,
  }
}

export function exportICS(events: CalendarEvent[], categoryName: (id: string) => string | undefined, calName = 'Personal HQ'): string {
  return serializeICS(
    events.map((e) => toExportEvent(e, categoryName(e.category))),
    calName,
  )
}

/* ───────────── Read-only subscription via local proxy ───────────── */

export async function proxyAvailable(): Promise<boolean> {
  try {
    const r = await fetch('/api/ics-proxy/health', { cache: 'no-store' })
    if (!r.ok) return false
    const j = (await r.json()) as { ok?: boolean }
    return !!j.ok
  } catch {
    return false
  }
}

export async function fetchFeedViaProxy(url: string): Promise<string> {
  let resp: Response
  try {
    resp = await fetch('/api/ics-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch {
    throw new Error('The local calendar proxy is not reachable. Run the app with `npm run dev` or `npm run preview`.')
  }
  let body: { ics?: string; error?: string } = {}
  try {
    body = await resp.json()
  } catch {
    throw new Error('The local calendar proxy is not available in this deployment (static hosting).')
  }
  if (!resp.ok || !body.ics) throw new Error(body.error ?? `Proxy error (HTTP ${resp.status}).`)
  return body.ics
}

export const subscriptionAdapter: CalendarAdapter = {
  id: 'ics-subscription',
  label: 'Public calendar subscription (read-only)',
  direction: 'read-only',
  async pull(source) {
    if (!source.url) throw new Error('This subscription has no URL.')
    try {
      const text = await fetchFeedViaProxy(source.url)
      const parsed = parseICS(text, getAppTimezone())
      if (parsed.warnings.length && !parsed.events.length) throw new Error(parsed.warnings[0])
      return await importParsedEvents(source, parsed.events, { category: 'imported', mirror: true, readOnly: true })
    } catch (err) {
      await recordSourceError(source.id, err instanceof Error ? err.message : String(err))
      throw err
    }
  },
}

export function looksLikeAppleShareLink(url: string): boolean {
  return /^(webcal|https):\/\/p\d+-caldav\.icloud\.com\//i.test(url.trim()) || /icloud\.com/i.test(url)
}
