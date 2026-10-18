/**
 * Turns stored events (incl. recurring masters and RECURRENCE-ID overrides) into concrete
 * instances for a visible date range, in the app timezone.
 */
import type { CalendarEvent, EventCategory } from '@/data/models'
import { expandRecurring } from '@/domain/rrule'
import { addDays, type ISODate } from '@/lib/dates'
import { zonedParts, zonedToUtc } from '@/lib/tz'

export interface EventInstance {
  key: string
  event: CalendarEvent
  allDay: boolean
  start: string // ISODate (all-day) or ISO instant
  end: string
  startDate: ISODate // local wall date
  endDate: ISODate // local wall date (inclusive)
  startTime?: string // HH:mm local
  endTime?: string
  color: string
  recurring: boolean
}

export function categoryColor(cats: EventCategory[], id: string): string {
  return cats.find((c) => c.id === id)?.color ?? '#64748b'
}

export function buildInstances(events: CalendarEvent[], from: ISODate, to: ISODate, tz: string, cats: EventCategory[]): EventInstance[] {
  // Overrides (RECURRENCE-ID) replace the matching generated occurrence of their master.
  const overrides = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.externalUid && e.externalRecurrenceId) {
      const s = overrides.get(e.externalUid) ?? new Set()
      s.add(e.externalRecurrenceId.length === 10 ? e.externalRecurrenceId : new Date(e.externalRecurrenceId).toISOString())
      overrides.set(e.externalUid, s)
    }
  }
  const out: EventInstance[] = []
  for (const e of events) {
    const isMaster = !!e.rrule && !e.externalRecurrenceId
    const occs = isMaster ? expandRecurring({ ...e, exdates: [...(e.exdates ?? []), ...(e.externalUid ? [...(overrides.get(e.externalUid) ?? [])] : [])] }, from, to, tz) : [{ start: e.start, end: e.end }]
    for (const o of occs) {
      let startDate: ISODate
      let endDate: ISODate
      let startTime: string | undefined
      let endTime: string | undefined
      if (e.allDay) {
        startDate = o.start
        endDate = o.end
      } else {
        const sp = zonedParts(o.start, tz)
        const ep = zonedParts(o.end, tz)
        startDate = sp.date
        startTime = sp.time
        endTime = ep.time
        // An event ending exactly at midnight belongs to the previous day.
        endDate = ep.time === '00:00' && ep.date > sp.date ? addDays(ep.date, -1) : ep.date
      }
      if (endDate < from || startDate > to) continue
      out.push({
        key: `${e.id}|${o.start}`,
        event: e,
        allDay: e.allDay,
        start: o.start,
        end: o.end,
        startDate,
        endDate,
        startTime,
        endTime,
        color: categoryColor(cats, e.category),
        recurring: isMaster,
      })
    }
  }
  return out.sort((a, b) => (a.startDate + (a.allDay ? '' : a.startTime)).localeCompare(b.startDate + (b.allDay ? '' : b.startTime)))
}

/** Instant at which an instance "starts" for reminders (all-day events: 09:00 local). */
export function instanceStartMs(i: EventInstance, tz: string): number {
  if (i.allDay) return Date.parse(zonedToUtc(i.startDate, '09:00', tz))
  return Date.parse(i.start)
}
