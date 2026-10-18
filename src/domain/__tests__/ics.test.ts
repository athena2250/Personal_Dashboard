import { describe, expect, it } from 'vitest'
import { foldLine, parseDuration, parseICS, serializeICS, unfold } from '../ics'
import { expandRecurring, parseRRule } from '../rrule'
import { zonedToUtc, zonedParts } from '@/lib/tz'

const SAMPLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:Work',
  'X-WR-TIMEZONE:America/New_York',
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:abc-1',
  'DTSTART;TZID=Asia/Kolkata:20260310T093000',
  'DTEND;TZID=Asia/Kolkata:20260310T103000',
  'SUMMARY:Stand-up\\, daily',
  'DESCRIPTION:Line one\\nLine two',
  'LOCATION:Room 1',
  'BEGIN:VALARM',
  'TRIGGER:-PT15M',
  'ACTION:DISPLAY',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:abc-2',
  'DTSTART;VALUE=DATE:20260320',
  'DTEND;VALUE=DATE:20260323',
  'SUMMARY:Conference',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:abc-3',
  'DTSTART:20260401T140000Z',
  'DURATION:PT1H30M',
  'SUMMARY:A very long title that will need to be folded because it exceeds seventy five octets in length',
  ' continued',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:abc-4',
  'DTSTART:20260402T090000',
  'SUMMARY:Floating',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('ICS parsing', () => {
  const cal = parseICS(SAMPLE, 'UTC')

  it('reads calendar metadata', () => {
    expect(cal.name).toBe('Work')
    expect(cal.timezone).toBe('America/New_York')
    expect(cal.events).toHaveLength(4)
  })

  it('converts TZID times to UTC', () => {
    const e = cal.events[0]
    expect(e.start).toBe('2026-03-10T04:00:00.000Z')
    expect(e.end).toBe('2026-03-10T05:00:00.000Z')
    expect(e.timezone).toBe('Asia/Kolkata')
    expect(e.title).toBe('Stand-up, daily')
    expect(e.description).toBe('Line one\nLine two')
    expect(e.reminders).toEqual([15])
  })

  it('converts exclusive all-day DTEND to inclusive end', () => {
    const e = cal.events[1]
    expect(e.allDay).toBe(true)
    expect(e.start).toBe('2026-03-20')
    expect(e.end).toBe('2026-03-22')
  })

  it('handles DURATION and unfolding', () => {
    const e = cal.events[2]
    expect(e.end).toBe('2026-04-01T15:30:00.000Z')
    expect(e.title.endsWith('in lengthcontinued')).toBe(true)
  })

  it('treats floating times in calendar timezone and flags cancelled', () => {
    const e = cal.events[3]
    expect(e.start).toBe(zonedToUtc('2026-04-02', '09:00', 'America/New_York'))
    expect(e.cancelled).toBe(true)
  })

  it('rejects non-ics content', () => {
    expect(parseICS('hello', 'UTC').warnings[0]).toMatch(/not an iCalendar/)
  })

  it('parses durations', () => {
    expect(parseDuration('-PT15M')).toBe(-15)
    expect(parseDuration('P1D')).toBe(1440)
    expect(parseDuration('P1W')).toBe(10080)
    expect(parseDuration('PT1H30M')).toBe(90)
  })
})

describe('ICS serialization', () => {
  it('round-trips events', () => {
    const text = serializeICS([
      { uid: 'x@personal-hq', title: 'Exam; GRE, final', allDay: true, start: '2026-11-01', end: '2026-11-01', reminders: [60] },
      { uid: 'y@personal-hq', title: 'Call', allDay: false, start: '2026-11-02T10:00:00.000Z', end: '2026-11-02T11:00:00.000Z', description: 'a\nb' },
      { uid: 'z@personal-hq', title: 'Weekly', allDay: false, start: zonedToUtc('2026-11-03', '09:00', 'Asia/Kolkata'), end: zonedToUtc('2026-11-03', '10:00', 'Asia/Kolkata'), timezone: 'Asia/Kolkata', rrule: 'FREQ=WEEKLY' },
    ])
    expect(text).toContain('DTSTART;VALUE=DATE:20261101')
    expect(text).toContain('DTEND;VALUE=DATE:20261102')
    expect(text).toContain('SUMMARY:Exam\\; GRE\\, final')
    expect(text).toContain('DTSTART;TZID=Asia/Kolkata:20261103T090000')
    expect(text).toContain('TRIGGER:-PT60M')
    const back = parseICS(text, 'UTC')
    expect(back.events).toHaveLength(3)
    expect(back.events[0]).toMatchObject({ uid: 'x@personal-hq', title: 'Exam; GRE, final', allDay: true, start: '2026-11-01', end: '2026-11-01', reminders: [60] })
    expect(back.events[1]).toMatchObject({ start: '2026-11-02T10:00:00.000Z', end: '2026-11-02T11:00:00.000Z', description: 'a\nb' })
    expect(back.events[2].start).toBe(zonedToUtc('2026-11-03', '09:00', 'Asia/Kolkata'))
    expect(back.events[2].rrule).toBe('FREQ=WEEKLY')
  })

  it('folds long lines at 75 octets, UTF-8 aware', () => {
    const long = 'SUMMARY:' + '日本語'.repeat(40)
    const folded = foldLine(long)
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(unfold(folded)[0]).toBe(long)
  })
})

describe('RRULE expansion', () => {
  it('weekly BYDAY respecting DST in the event timezone', () => {
    const start = zonedToUtc('2026-03-02', '09:00', 'America/New_York') // Monday, before DST (Mar 8)
    const occ = expandRecurring(
      { allDay: false, start, end: new Date(Date.parse(start) + 3600000).toISOString(), rrule: 'FREQ=WEEKLY;BYDAY=MO,WE', timezone: 'America/New_York' },
      '2026-03-01',
      '2026-03-15',
      'America/New_York',
    ).filter((o) => o.start < '2026-03-16')
    expect(occ).toHaveLength(4)
    for (const o of occ) expect(zonedParts(o.start, 'America/New_York').time).toBe('09:00')
    // UTC hour changes after DST starts
    expect(new Date(occ[0].start).getUTCHours()).toBe(14)
    expect(new Date(occ[3].start).getUTCHours()).toBe(13)
  })

  it('monthly by nth weekday, COUNT and EXDATE', () => {
    const occ = expandRecurring(
      { allDay: true, start: '2026-01-13', end: '2026-01-13', rrule: 'FREQ=MONTHLY;BYDAY=2TU;COUNT=4', exdates: ['2026-02-10'] },
      '2026-01-01',
      '2026-12-31',
      'UTC',
    )
    expect(occ.map((o) => o.start)).toEqual(['2026-01-13', '2026-03-10', '2026-04-14'])
  })

  it('last weekday of month and UNTIL', () => {
    const occ = expandRecurring({ allDay: true, start: '2026-01-30', end: '2026-01-30', rrule: 'FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20260401' }, '2026-01-01', '2026-12-31', 'UTC')
    expect(occ.map((o) => o.start)).toEqual(['2026-01-30', '2026-02-27', '2026-03-27'])
  })

  it('daily with interval only returns window', () => {
    const occ = expandRecurring({ allDay: true, start: '2020-01-01', end: '2020-01-01', rrule: 'FREQ=DAILY;INTERVAL=2' }, '2026-10-01', '2026-10-07', 'UTC')
    expect(occ.every((o) => o.start >= '2026-09-30' && o.start <= '2026-10-08')).toBe(true)
    expect(occ.length).toBeGreaterThanOrEqual(3)
  })

  it('parses rules', () => {
    expect(parseRRule('RRULE:FREQ=YEARLY;INTERVAL=2')).toMatchObject({ freq: 'YEARLY', interval: 2 })
    expect(parseRRule('FREQ=SECONDLY')).toBeNull()
  })
})
