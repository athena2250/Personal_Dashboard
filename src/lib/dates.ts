/**
 * Date-only helpers. Calendar dates are `YYYY-MM-DD` strings with no timezone.
 * Arithmetic is done in UTC so DST transitions never shift a day.
 */

export type ISODate = string // YYYY-MM-DD
export type MonthKey = string // YYYY-MM

const DAY_MS = 86_400_000

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
}

export function toUTCDate(d: ISODate): Date {
  return new Date(d + 'T00:00:00Z')
}

export function fromUTCDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

export function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

export function makeDate(y: number, m: number, d: number): ISODate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTCDate(new Date(toUTCDate(d).getTime() + n * DAY_MS))
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTCDate(a).getTime() - toUTCDate(b).getTime()) / DAY_MS)
}

export function dayOfWeek(d: ISODate): number {
  return toUTCDate(d).getUTCDay()
}

export function startOfWeek(d: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const dow = dayOfWeek(d)
  const delta = (dow - weekStartsOn + 7) % 7
  return addDays(d, -delta)
}

export function monthKey(d: ISODate): MonthKey {
  return d.slice(0, 7)
}

export function startOfMonth(d: ISODate | MonthKey): ISODate {
  return d.slice(0, 7) + '-01'
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function endOfMonth(d: ISODate | MonthKey): ISODate {
  const [y, m] = d.split('-').map(Number)
  return makeDate(y, m, daysInMonth(y, m))
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, day] = d.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const want = anchorDay ?? day
  return makeDate(ny, nm, Math.min(want, daysInMonth(ny, nm)))
}

export function addMonthKey(k: MonthKey, n: number): MonthKey {
  return addMonths(k + '-01', n).slice(0, 7)
}

export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  let k = from
  let guard = 0
  while (k <= to && guard++ < 1200) {
    out.push(k)
    k = addMonthKey(k, 1)
  }
  return out
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function minDate(a: ISODate, b: ISODate) {
  return a < b ? a : b
}
export function maxDate(a: ISODate, b: ISODate) {
  return a > b ? a : b
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(opts: Intl.DateTimeFormatOptions, locale?: string) {
  const key = JSON.stringify([locale, opts])
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' })
    fmtCache.set(key, f)
  }
  return f
}

export function formatDate(d: ISODate | undefined | null, style: 'short' | 'medium' | 'long' | 'weekday' = 'medium'): string {
  if (!d || !isISODate(d)) return '—'
  const date = toUTCDate(d)
  switch (style) {
    case 'short':
      return fmt({ month: 'short', day: 'numeric' }).format(date)
    case 'long':
      return fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)
    case 'weekday':
      return fmt({ weekday: 'short', month: 'short', day: 'numeric' }).format(date)
    default:
      return fmt({ month: 'short', day: 'numeric', year: 'numeric' }).format(date)
  }
}

export function formatMonth(k: MonthKey, style: 'short' | 'long' = 'long'): string {
  return fmt(style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' }).format(
    toUTCDate(k + '-01'),
  )
}

export function weekdayShort(dow: number): string {
  // 2023-01-01 was a Sunday.
  return fmt({ weekday: 'short' }).format(toUTCDate(addDays('2023-01-01', dow)))
}

export function relativeDays(d: ISODate, today: ISODate): string {
  const n = diffDays(d, today)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n > 1 && n < 7) return `In ${n} days`
  if (n < -1 && n > -7) return `${-n} days ago`
  return formatDate(d, 'medium')
}

export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0m'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatHours(min: number): string {
  const h = min / 60
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`
}
