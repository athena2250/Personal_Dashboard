/**
 * Minimal RFC 5545 (iCalendar) parser and serializer for VEVENTs.
 * Handles: line folding, escaping, TZID / UTC / floating times, VALUE=DATE all-day events,
 * DURATION, RRULE/EXDATE passthrough, RECURRENCE-ID overrides, VALARM display triggers,
 * CANCELLED status and X-WR-TIMEZONE / X-WR-CALNAME.
 */
import { addDays, diffDays, type ISODate } from '@/lib/dates'
import { isValidTimezone, zonedParts, zonedToUtc } from '@/lib/tz'

export interface ParsedEvent {
  uid: string
  recurrenceId?: string
  title: string
  description?: string
  location?: string
  allDay: boolean
  start: string
  end: string
  timezone?: string
  rrule?: string
  exdates: string[]
  lastModified?: string
  sequence: number
  categories: string[]
  reminders: number[]
  cancelled: boolean
}

export interface ParsedCalendar {
  name?: string
  timezone?: string
  events: ParsedEvent[]
  warnings: string[]
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

export function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1)
    else if (line.length) out.push(line)
  }
  return out
}

export function parseProp(line: string): Prop | null {
  let inQuote = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuote = !inQuote
    else if (c === ':' && !inQuote) {
      colon = i
      break
    }
  }
  if (colon < 0) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const parts: string[] = []
  let buf = ''
  inQuote = false
  for (const c of head) {
    if (c === '"') inQuote = !inQuote
    if (c === ';' && !inQuote) {
      parts.push(buf)
      buf = ''
    } else buf += c
  }
  parts.push(buf)
  const params: Record<string, string> = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: parts[0].toUpperCase(), params, value }
}

export function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

export function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

const WINDOWS_TZ: Record<string, string> = {
  'India Standard Time': 'Asia/Kolkata',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Singapore Standard Time': 'Asia/Singapore',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'Arabian Standard Time': 'Asia/Dubai',
  UTC: 'UTC',
}

export function resolveTzid(tzid: string | undefined, fallback: string): string {
  if (!tzid) return fallback
  if (isValidTimezone(tzid)) return tzid
  if (WINDOWS_TZ[tzid]) return WINDOWS_TZ[tzid]
  // e.g. "/mozilla.org/20050126_1/America/New_York" or "/citadel.org/.../Europe/London"
  const segs = tzid.split('/').filter(Boolean)
  for (let i = 0; i < segs.length; i++) {
    const candidate = segs.slice(i).join('/')
    if (isValidTimezone(candidate)) return candidate
  }
  return fallback
}

interface DateValue {
  allDay: boolean
  value: string // ISODate for all-day, ISO UTC otherwise
  tz?: string
}

export function parseDateValue(prop: Prop, defaultTz: string): DateValue | null {
  const v = prop.value.trim()
  const isDate = prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v)
  if (isDate) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
    if (!m) return null
    return { allDay: true, value: `${m[1]}-${m[2]}-${m[3]}` }
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if (!m) return null
  const date = `${m[1]}-${m[2]}-${m[3]}`
  const time = `${m[4]}:${m[5]}:${m[6] ?? '00'}`
  if (m[7]) return { allDay: false, value: new Date(`${date}T${time}Z`).toISOString(), tz: 'UTC' }
  const tz = resolveTzid(prop.params.TZID, defaultTz)
  return { allDay: false, value: zonedToUtc(date, time, tz), tz }
}

/** Parses an ISO 8601 duration (P1DT2H, PT30M, P1W, -PT15M) to minutes. */
export function parseDuration(v: string): number | null {
  const m = v.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const mins = (+(m[2] ?? 0)) * 7 * 1440 + (+(m[3] ?? 0)) * 1440 + (+(m[4] ?? 0)) * 60 + (+(m[5] ?? 0)) + Math.round(+(m[6] ?? 0) / 60)
  return sign * mins
}

export function parseICS(text: string, defaultTz: string): ParsedCalendar {
  const lines = unfold(text)
  const warnings: string[] = []
  if (!lines.some((l) => l.toUpperCase().startsWith('BEGIN:VCALENDAR'))) {
    return { events: [], warnings: ['This file is not an iCalendar (.ics) file.'] }
  }
  let calName: string | undefined
  let calTz: string | undefined
  // First pass: calendar-level properties.
  let depth = 0
  for (const line of lines) {
    const p = parseProp(line)
    if (!p) continue
    if (p.name === 'BEGIN') depth++
    else if (p.name === 'END') depth--
    else if (depth === 1 && p.name === 'X-WR-CALNAME') calName = unescapeText(p.value)
    else if (depth === 1 && p.name === 'X-WR-TIMEZONE') calTz = resolveTzid(p.value, defaultTz)
  }
  const floatingTz = calTz ?? defaultTz

  const events: ParsedEvent[] = []
  const stack: string[] = []
  let cur: Record<string, Prop[]> | null = null
  let alarms: Prop[][] = []
  let alarm: Prop[] | null = null

  for (const line of lines) {
    const p = parseProp(line)
    if (!p) continue
    if (p.name === 'BEGIN') {
      const comp = p.value.toUpperCase()
      stack.push(comp)
      if (comp === 'VEVENT') {
        cur = {}
        alarms = []
      } else if (comp === 'VALARM' && cur) alarm = []
      continue
    }
    if (p.name === 'END') {
      const comp = stack.pop()
      if (comp === 'VALARM' && alarm) {
        alarms.push(alarm)
        alarm = null
      } else if (comp === 'VEVENT' && cur) {
        const ev = buildEvent(cur, alarms, floatingTz, warnings)
        if (ev) events.push(ev)
        cur = null
      }
      continue
    }
    if (alarm) alarm.push(p)
    else if (cur && stack[stack.length - 1] === 'VEVENT') (cur[p.name] ??= []).push(p)
  }
  return { name: calName, timezone: calTz, events, warnings }
}

function buildEvent(props: Record<string, Prop[]>, alarms: Prop[][], tz: string, warnings: string[]): ParsedEvent | null {
  const one = (n: string) => props[n]?.[0]
  const dtstart = one('DTSTART')
  if (!dtstart) {
    warnings.push('Skipped an event without a start date.')
    return null
  }
  const start = parseDateValue(dtstart, tz)
  if (!start) {
    warnings.push(`Skipped an event with an unreadable start date (${dtstart.value}).`)
    return null
  }
  const title = unescapeText(one('SUMMARY')?.value ?? '').trim() || '(No title)'
  const uid = one('UID')?.value?.trim() || `generated-${hash(title + start.value)}`

  let end: string
  const dtend = one('DTEND')
  const dur = one('DURATION')
  if (start.allDay) {
    const endVal = dtend ? parseDateValue(dtend, tz) : null
    if (endVal?.allDay) end = addDays(endVal.value, -1) // DTEND is exclusive
    else if (dur) {
      const mins = parseDuration(dur.value) ?? 1440
      end = addDays(start.value, Math.max(0, Math.ceil(mins / 1440) - 1))
    } else end = start.value
    if (end < start.value) end = start.value
  } else {
    const endVal = dtend ? parseDateValue(dtend, tz) : null
    if (endVal && !endVal.allDay) end = endVal.value
    else if (dur) end = new Date(Date.parse(start.value) + (parseDuration(dur.value) ?? 0) * 60000).toISOString()
    else end = start.value
    if (end < start.value) end = start.value
  }

  const exdates: string[] = []
  for (const p of props['EXDATE'] ?? []) {
    for (const raw of p.value.split(',')) {
      const dv = parseDateValue({ ...p, value: raw }, tz)
      if (dv) exdates.push(dv.allDay ? dv.value : dv.value)
    }
  }

  let recurrenceId: string | undefined
  const rid = one('RECURRENCE-ID')
  if (rid) recurrenceId = parseDateValue(rid, tz)?.value

  const lm = one('LAST-MODIFIED') ?? one('DTSTAMP')
  const lastModified = lm ? parseDateValue(lm, 'UTC')?.value : undefined

  const reminders: number[] = []
  for (const a of alarms) {
    const trig = a.find((p) => p.name === 'TRIGGER')
    if (!trig || trig.params.VALUE === 'DATE-TIME') continue
    const mins = parseDuration(trig.value)
    if (mins != null && mins <= 0) reminders.push(-mins)
  }

  const categories = (props['CATEGORIES'] ?? []).flatMap((p) => p.value.split(',').map((c) => unescapeText(c).trim())).filter(Boolean)
  const rrule = one('RRULE')?.value?.trim()

  return {
    uid,
    recurrenceId,
    title,
    description: one('DESCRIPTION') ? unescapeText(one('DESCRIPTION')!.value) : undefined,
    location: one('LOCATION') ? unescapeText(one('LOCATION')!.value) : undefined,
    allDay: start.allDay,
    start: start.value,
    end,
    timezone: start.tz && start.tz !== 'UTC' ? start.tz : undefined,
    rrule: rrule || undefined,
    exdates,
    lastModified,
    sequence: Number(one('SEQUENCE')?.value ?? 0) || 0,
    categories,
    reminders: [...new Set(reminders)].sort((a, b) => a - b),
    cancelled: one('STATUS')?.value?.toUpperCase() === 'CANCELLED',
  }
}

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/* ───────────────────────── Serialization ───────────────────────── */

export interface ExportEvent {
  uid: string
  title: string
  description?: string
  location?: string
  allDay: boolean
  start: string
  end: string
  timezone?: string
  rrule?: string
  exdates?: string[]
  categories?: string[]
  reminders?: number[]
  lastModified?: string
  created?: string
}

/** Folds a content line to 75 octets (UTF-8 aware), continuation lines start with a space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curBytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74
    if (curBytes + b > limit) {
      out.push(cur)
      cur = ''
      curBytes = 0
    }
    cur += ch
    curBytes += b
  }
  if (cur) out.push(cur)
  return out.join('\r\n ')
}

function icsDate(d: ISODate): string {
  return d.replace(/-/g, '')
}

function icsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsLocal(iso: string, tz: string): string {
  const p = zonedParts(iso, tz)
  return `${p.date.replace(/-/g, '')}T${p.time.replace(':', '')}${String(p.second).padStart(2, '0')}`
}

export function serializeICS(events: ExportEvent[], calName = 'Personal HQ'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Personal HQ//Events Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ]
  const stamp = icsUtc(new Date().toISOString())
  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.uid}`)
    lines.push(`DTSTAMP:${stamp}`)
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`)
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(e.end < e.start ? e.start : e.end, 1))}`)
    } else if (e.rrule && e.timezone && e.timezone !== 'UTC') {
      // Recurring timed events keep wall-clock time in their zone so DST is respected.
      lines.push(`DTSTART;TZID=${e.timezone}:${icsLocal(e.start, e.timezone)}`)
      lines.push(`DTEND;TZID=${e.timezone}:${icsLocal(e.end, e.timezone)}`)
    } else {
      lines.push(`DTSTART:${icsUtc(e.start)}`)
      lines.push(`DTEND:${icsUtc(e.end)}`)
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`)
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`)
    if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(escapeText).join(',')}`)
    if (e.rrule) lines.push(`RRULE:${e.rrule}`)
    if (e.exdates?.length) {
      for (const x of e.exdates) {
        if (e.allDay) lines.push(`EXDATE;VALUE=DATE:${icsDate(x)}`)
        else if (e.rrule && e.timezone && e.timezone !== 'UTC') lines.push(`EXDATE;TZID=${e.timezone}:${icsLocal(x, e.timezone)}`)
        else lines.push(`EXDATE:${icsUtc(x)}`)
      }
    }
    if (e.created) lines.push(`CREATED:${icsUtc(e.created)}`)
    if (e.lastModified) lines.push(`LAST-MODIFIED:${icsUtc(e.lastModified)}`)
    for (const r of e.reminders ?? []) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, `TRIGGER:-PT${Math.max(0, Math.round(r))}M`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** Length of an all-day event in days (inclusive). */
export function allDaySpan(start: ISODate, end: ISODate): number {
  return diffDays(end, start) + 1
}
