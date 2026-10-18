/**
 * Timezone helpers built on Intl (no dependency). Instants are ISO UTC strings.
 * "Zoned" values are wall-clock date (YYYY-MM-DD) + time (HH:mm) in an IANA timezone.
 */
import type { ISODate } from './dates'
import { pad } from './dates'

let appTimezone = browserTimezone()

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function setAppTimezone(tz: string) {
  if (isValidTimezone(tz)) appTimezone = tz
}

export function getAppTimezone(): string {
  return appTimezone
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function listTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  try {
    const list = intl.supportedValuesOf?.('timeZone')
    if (list?.length) return list.includes('UTC') ? list : ['UTC', ...list]
  } catch {
    /* fall through */
  }
  return ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London', browserTimezone()]
}

const partsCache = new Map<string, Intl.DateTimeFormat>()
function partsFormatter(tz: string) {
  let f = partsCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsCache.set(tz, f)
  }
  return f
}

export interface ZonedParts {
  date: ISODate
  time: string // HH:mm
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function zonedParts(instant: string | Date | number, tz = appTimezone): ZonedParts {
  const d = instant instanceof Date ? instant : new Date(instant)
  const parts = partsFormatter(tz).formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour') % 24
  const minute = get('minute')
  const second = get('second')
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    date: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  }
}

/** Offset of `tz` from UTC at the given instant, in minutes (e.g. Asia/Kolkata → 330). */
export function tzOffsetMinutes(instantMs: number, tz: string): number {
  const p = zonedParts(instantMs, tz)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUTC - Math.floor(instantMs / 1000) * 1000) / 60000)
}

/** Converts a wall-clock time in `tz` to an ISO UTC instant. Handles DST gaps by shifting forward. */
export function zonedToUtc(date: ISODate, time: string, tz = appTimezone): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm, ss = 0] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss)
  let offset = tzOffsetMinutes(guess, tz)
  let result = guess - offset * 60000
  const offset2 = tzOffsetMinutes(result, tz)
  if (offset2 !== offset) {
    offset = offset2
    result = guess - offset * 60000
  }
  return new Date(result).toISOString()
}

export function todayInTz(tz = appTimezone): ISODate {
  return zonedParts(Date.now(), tz).date
}

export function nowTimeInTz(tz = appTimezone): string {
  return zonedParts(Date.now(), tz).time
}

export function formatTime(instant: string, tz = appTimezone): string {
  const t = zonedParts(instant, tz).time
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`
}

export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`
}
