import { db } from '../db'
import type { CalendarEvent, CalendarSource } from '../models'
import { tracked } from '../saveStatus'
import { eventSchema, validate } from '../schemas'
import type { ParsedEvent } from '@/domain/ics'
import { nowISO } from '@/lib/util'
import { compact, stamp, touch, type NewRow } from './base'

export const LOCAL_UID_SUFFIX = '@personal-hq'

export type EventInput = NewRow<CalendarEvent>

export async function addEvent(input: EventInput) {
  validate(eventSchema, input)
  return tracked(async () => {
    const row = stamp<CalendarEvent>(compact({ ...input, title: input.title.trim() }))
    await db.events.add(row)
    return row
  })
}

export function updateEvent(id: string, patch: Partial<EventInput>) {
  return tracked(async () => {
    const cur = await db.events.get(id)
    if (!cur) throw new Error('Event not found')
    if (cur.readOnly) throw new Error('This event comes from a read-only subscription. Edit it in Apple Calendar instead.')
    validate(eventSchema, { ...cur, ...patch })
    await db.events.update(id, touch(patch))
  })
}

export function deleteEvent(id: string) {
  return tracked(async () => {
    const cur = await db.events.get(id)
    if (cur?.readOnly) throw new Error('This event comes from a read-only subscription and will be restored on the next refresh.')
    await db.events.delete(id)
  })
}

/** Excludes a single occurrence of a recurring event. */
export function excludeOccurrence(id: string, occurrenceStart: string) {
  return tracked(async () => {
    const cur = await db.events.get(id)
    if (!cur) return
    if (cur.readOnly) throw new Error('Read-only subscription events cannot be changed here.')
    await db.events.update(id, touch({ exdates: [...(cur.exdates ?? []), occurrenceStart] }))
  })
}

/* ───────────── Sources ───────────── */

export function addSource(input: Omit<NewRow<CalendarSource>, 'direction'>) {
  return tracked(async () => {
    const row = stamp<CalendarSource>({ ...input, direction: 'read-only' })
    await db.calendarSources.add(row)
    return row
  })
}

export function updateSource(id: string, patch: Partial<CalendarSource>) {
  return tracked(() => db.calendarSources.update(id, touch(patch)))
}

/** Deletes a source. Subscription events are removed; imported file events are kept unless `removeEvents`. */
export function deleteSource(id: string, removeEvents: boolean) {
  return tracked(() =>
    db.transaction('rw', [db.calendarSources, db.events], async () => {
      if (removeEvents) await db.events.where('sourceId').equals(id).delete()
      else await db.events.where('sourceId').equals(id).modify({ sourceId: undefined, readOnly: false })
      await db.calendarSources.delete(id)
    }),
  )
}

export interface ImportResult {
  added: number
  updated: number
  removed: number
  unchanged: number
  skippedLocal: number
}

const keyOf = (uid: string, rid?: string) => `${uid}|${rid ?? ''}`

/**
 * Upserts parsed ICS events for a source without creating duplicates.
 * - Events are matched by UID (+ RECURRENCE-ID).
 * - Events originally exported from Personal HQ (UID ends with @personal-hq) whose local copy
 *   still exists are skipped, so export → Apple Calendar → re-import never duplicates.
 * - When `mirror` is true (subscriptions), events missing from the feed are removed.
 */
export function importParsedEvents(
  source: CalendarSource,
  parsed: ParsedEvent[],
  opts: { category: string; mirror: boolean; readOnly: boolean },
) {
  return tracked(() =>
    db.transaction('rw', [db.events, db.calendarSources], async () => {
      const result: ImportResult = { added: 0, updated: 0, removed: 0, unchanged: 0, skippedLocal: 0 }
      const scope = opts.mirror
        ? await db.events.where('sourceId').equals(source.id).toArray()
        : await db.events.filter((e) => !!e.externalUid).toArray()
      const existing = new Map(scope.map((e) => [keyOf(e.externalUid!, e.externalRecurrenceId), e]))
      const seen = new Set<string>()
      for (const p of parsed) {
        if (p.uid.endsWith(LOCAL_UID_SUFFIX)) {
          const localId = p.uid.slice(0, -LOCAL_UID_SUFFIX.length)
          if (await db.events.get(localId)) {
            result.skippedLocal++
            continue
          }
        }
        const key = keyOf(p.uid, p.recurrenceId)
        if (seen.has(key)) continue
        seen.add(key)
        const prev = existing.get(key)
        if (p.cancelled) {
          if (prev) {
            await db.events.delete(prev.id)
            result.removed++
          }
          continue
        }
        const data = compact({
          title: p.title,
          description: p.description,
          location: p.location,
          allDay: p.allDay,
          start: p.start,
          end: p.end,
          timezone: p.timezone,
          rrule: p.rrule,
          exdates: p.exdates.length ? p.exdates : undefined,
          reminders: p.reminders,
          externalUid: p.uid,
          externalRecurrenceId: p.recurrenceId,
          externalLastModified: p.lastModified,
          sourceId: source.id,
          readOnly: opts.readOnly,
        })
        if (prev) {
          const changed =
            prev.title !== data.title ||
            prev.start !== data.start ||
            prev.end !== data.end ||
            prev.allDay !== data.allDay ||
            (prev.description ?? '') !== (data.description ?? '') ||
            (prev.location ?? '') !== (data.location ?? '') ||
            (prev.rrule ?? '') !== (data.rrule ?? '') ||
            JSON.stringify(prev.exdates ?? []) !== JSON.stringify(data.exdates ?? [])
          if (changed) {
            await db.events.update(prev.id, touch({ ...data, exdates: data.exdates, rrule: data.rrule }))
            result.updated++
          } else result.unchanged++
        } else {
          await db.events.add(stamp<CalendarEvent>({ ...data, category: opts.category, reminders: data.reminders ?? [] }))
          result.added++
        }
      }
      if (opts.mirror) {
        for (const [key, ev] of existing) {
          if (!seen.has(key)) {
            await db.events.delete(ev.id)
            result.removed++
          }
        }
      }
      const now = nowISO()
      await db.calendarSources.update(source.id, {
        lastAttemptAt: now,
        lastSyncAt: now,
        lastError: undefined,
        lastResult: { added: result.added, updated: result.updated, removed: result.removed, unchanged: result.unchanged },
        updatedAt: now,
      })
      return result
    }),
  )
}

export function recordSourceError(id: string, message: string) {
  return db.calendarSources.update(id, { lastAttemptAt: nowISO(), lastError: message })
}
