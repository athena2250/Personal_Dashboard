/**
 * RRULE expansion for calendar display (subset of RFC 5545):
 * FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL, BYDAY (incl. ordinals like 2MO / -1FR),
 * BYMONTHDAY, WKST. Expansion happens on wall-clock dates in the event's timezone so DST is respected.
 */
import { addDays, dayOfWeek, daysInMonth, diffDays, makeDate, startOfWeek, type ISODate } from '@/lib/dates'
import { zonedParts, zonedToUtc } from '@/lib/tz'

export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count?: number
  until?: string // ISODate (all-day) or ISO instant
  byday?: { ord: number; dow: number }[]
  bymonthday?: number[]
  wkst: 0 | 1
}

const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const DOW_REV = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function parseRRule(s: string): RRule | null {
  const parts = Object.fromEntries(
    s
      .replace(/^RRULE:/i, '')
      .split(';')
      .map((kv) => kv.split('='))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k.toUpperCase(), v]),
  )
  const freq = parts.FREQ?.toUpperCase() as RRule['freq']
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null
  const rule: RRule = {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    wkst: parts.WKST === 'SU' ? 0 : 1,
  }
  if (parts.COUNT) rule.count = Math.max(1, Number(parts.COUNT) || 1)
  if (parts.UNTIL) {
    const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
    if (m) rule.until = m[4] ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toISOString() : `${m[1]}-${m[2]}-${m[3]}`
  }
  if (parts.BYDAY) {
    rule.byday = parts.BYDAY.split(',')
      .map((d: string) => d.trim().toUpperCase().match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/))
      .filter((m: RegExpMatchArray | null): m is RegExpMatchArray => m !== null)
      .map((m: RegExpMatchArray) => ({ ord: m[1] ? Number(m[1]) : 0, dow: DOW[m[2]] }))
  }
  if (parts.BYMONTHDAY) rule.bymonthday = parts.BYMONTHDAY.split(',').map(Number).filter((n: number) => n !== 0 && Math.abs(n) <= 31)
  return rule
}

export type SimpleRepeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export function buildRRule(repeat: SimpleRepeat, opts: { interval?: number; until?: ISODate; count?: number } = {}): string | undefined {
  if (repeat === 'none') return undefined
  const parts = [`FREQ=${repeat.toUpperCase()}`]
  if (opts.interval && opts.interval > 1) parts.push(`INTERVAL=${opts.interval}`)
  if (opts.count) parts.push(`COUNT=${opts.count}`)
  else if (opts.until) parts.push(`UNTIL=${opts.until.replace(/-/g, '')}`)
  return parts.join(';')
}

export function describeRRule(s?: string): string {
  if (!s) return 'Does not repeat'
  const r = parseRRule(s)
  if (!r) return 'Custom repeat'
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.freq]
  let txt = r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`
  if (r.byday?.length && r.freq === 'WEEKLY') txt += ` on ${r.byday.map((b) => DOW_REV[b.dow]).join(', ')}`
  if (r.count) txt += `, ${r.count} times`
  else if (r.until) txt += `, until ${r.until.slice(0, 10)}`
  return txt
}

export function simpleRepeatOf(s?: string): SimpleRepeat {
  if (!s) return 'none'
  const r = parseRRule(s)
  if (!r || r.byday?.length || r.bymonthday?.length) return 'none'
  return r.freq.toLowerCase() as SimpleRepeat
}

function nthWeekdayOfMonth(y: number, m: number, dow: number, ord: number): ISODate | null {
  const dim = daysInMonth(y, m)
  if (ord > 0) {
    const first = makeDate(y, m, 1)
    const delta = (dow - dayOfWeek(first) + 7) % 7
    const day = 1 + delta + (ord - 1) * 7
    return day <= dim ? makeDate(y, m, day) : null
  }
  const last = makeDate(y, m, dim)
  const delta = (dayOfWeek(last) - dow + 7) % 7
  const day = dim - delta + (ord + 1) * 7
  return day >= 1 ? makeDate(y, m, day) : null
}

/** Candidate wall-clock dates for one period, sorted. */
function periodDates(rule: RRule, d0: ISODate, periodIndex: number): ISODate[] {
  const [y0, m0, day0] = d0.split('-').map(Number)
  switch (rule.freq) {
    case 'DAILY':
      return [addDays(d0, periodIndex * rule.interval)]
    case 'WEEKLY': {
      const weekStart = addDays(startOfWeek(d0, rule.wkst), periodIndex * 7 * rule.interval)
      if (!rule.byday?.length) return [addDays(d0, periodIndex * 7 * rule.interval)]
      return rule.byday.map((b) => addDays(weekStart, (b.dow - rule.wkst + 7) % 7)).sort()
    }
    case 'MONTHLY': {
      const total = y0 * 12 + (m0 - 1) + periodIndex * rule.interval
      const y = Math.floor(total / 12)
      const m = (total % 12) + 1
      const dim = daysInMonth(y, m)
      if (rule.byday?.length) {
        const out: ISODate[] = []
        for (const b of rule.byday) {
          if (b.ord) {
            const d = nthWeekdayOfMonth(y, m, b.dow, b.ord)
            if (d) out.push(d)
          } else {
            for (let day = 1; day <= dim; day++) if (dayOfWeek(makeDate(y, m, day)) === b.dow) out.push(makeDate(y, m, day))
          }
        }
        return out.sort()
      }
      const days = rule.bymonthday?.length ? rule.bymonthday : [day0]
      return days
        .map((d) => (d > 0 ? d : dim + d + 1))
        .filter((d) => d >= 1 && d <= dim)
        .map((d) => makeDate(y, m, d))
        .sort()
    }
    case 'YEARLY': {
      const y = y0 + periodIndex * rule.interval
      if (m0 === 2 && day0 === 29 && daysInMonth(y, 2) < 29) return []
      return [makeDate(y, m0, day0)]
    }
  }
}

export interface Occurrence {
  start: string
  end: string
}

/**
 * Expands a recurring event into occurrences overlapping [from, to] (wall-clock dates in `tz`).
 * For all-day events start/end are ISODates (end inclusive); otherwise ISO UTC instants.
 */
export function expandRecurring(
  ev: { allDay: boolean; start: string; end: string; rrule?: string; exdates?: string[]; timezone?: string },
  from: ISODate,
  to: ISODate,
  displayTz: string,
  maxInstances = 1000,
): Occurrence[] {
  const rule = ev.rrule ? parseRRule(ev.rrule) : null
  if (!rule) return [{ start: ev.start, end: ev.end }]
  const tz = ev.timezone || displayTz
  const ex = new Set((ev.exdates ?? []).map((x) => (ev.allDay ? x.slice(0, 10) : new Date(x).toISOString())))

  let d0: ISODate
  let t0 = '00:00:00'
  let spanDays = 0
  let durationMs = 0
  if (ev.allDay) {
    d0 = ev.start
    spanDays = Math.max(0, diffDays(ev.end, ev.start))
  } else {
    const p = zonedParts(ev.start, tz)
    d0 = p.date
    t0 = `${p.time}:${String(p.second).padStart(2, '0')}`
    durationMs = Math.max(0, Date.parse(ev.end) - Date.parse(ev.start))
    spanDays = Math.ceil(durationMs / 86400000)
  }
  const windowStart = addDays(from, -spanDays - 1)
  const out: Occurrence[] = []
  let emitted = 0
  for (let i = 0; i < 20000; i++) {
    const dates = periodDates(rule, d0, i)
    let stop = false
    for (const d of dates) {
      if (d < d0) continue
      if (rule.count != null && emitted >= rule.count) {
        stop = true
        break
      }
      if (d < windowStart) {
        // Before the visible window: count it without the (costly) timezone conversion.
        if (rule.until && d > rule.until.slice(0, 10)) {
          stop = true
          break
        }
        emitted++
        continue
      }
      let start: string
      let end: string
      if (ev.allDay) {
        start = d
        end = addDays(d, spanDays)
        if (rule.until && d > rule.until.slice(0, 10)) {
          stop = true
          break
        }
      } else {
        start = zonedToUtc(d, t0, tz)
        end = new Date(Date.parse(start) + durationMs).toISOString()
        if (rule.until && (rule.until.length === 10 ? d > rule.until : start > rule.until)) {
          stop = true
          break
        }
      }
      if (d > addDays(to, 1)) {
        stop = true
        break
      }
      emitted++
      if (!ex.has(start)) out.push({ start, end })
      if (out.length >= maxInstances) return out
    }
    if (stop) break
    // Safety for rules that never produce (e.g. BYMONTHDAY=31 forever in short months is fine; empty YEARLY Feb 29 too)
    if (rule.freq === 'YEARLY' && i > 400) break
  }
  return out
}

