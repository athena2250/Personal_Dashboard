/**
 * Learning/activity analytics computed purely from recorded sessions.
 */
import type { GoalDef, LearningSession, Tracker, TrackerRecord } from '@/data/models'
import {
  addDays,
  diffDays,
  eachDay,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  type ISODate,
} from '@/lib/dates'

export interface DayStat {
  date: ISODate
  minutes: number
  sessions: number
  count: number
}

export function aggregateByDay(sessions: Pick<LearningSession, 'date' | 'minutes' | 'count'>[]): Map<ISODate, DayStat> {
  const m = new Map<ISODate, DayStat>()
  for (const s of sessions) {
    const cur = m.get(s.date) ?? { date: s.date, minutes: 0, sessions: 0, count: 0 }
    cur.minutes += s.minutes || 0
    cur.sessions += 1
    cur.count += s.count || 0
    m.set(s.date, cur)
  }
  return m
}

export interface StreakInfo {
  current: number
  longest: number
  activeDays: number
  /** True when today has no activity yet but yesterday did — streak is alive but at risk. */
  atRisk: boolean
}

/**
 * A day counts toward a streak when it has at least one session.
 * The current streak survives until the end of today: if today is empty but yesterday is not,
 * the streak counts back from yesterday (atRisk = true).
 */
export function computeStreaks(dates: Iterable<ISODate>, today: ISODate): StreakInfo {
  const set = new Set<ISODate>()
  for (const d of dates) if (d <= today) set.add(d)
  if (set.size === 0) return { current: 0, longest: 0, activeDays: 0, atRisk: false }

  const sorted = [...set].sort()
  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (diffDays(sorted[i], sorted[i - 1]) === 1) {
      run++
      longest = Math.max(longest, run)
    } else run = 1
  }

  let current = 0
  let atRisk = false
  let cursor = today
  if (!set.has(today)) {
    cursor = addDays(today, -1)
    atRisk = set.has(cursor)
  }
  while (set.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }
  return { current, longest, activeDays: set.size, atRisk }
}

export type PeriodView = 'day' | 'week' | 'month'

export function periodRange(view: PeriodView, anchor: ISODate, weekStartsOn: 0 | 1 = 1): { from: ISODate; to: ISODate } {
  if (view === 'day') return { from: anchor, to: anchor }
  if (view === 'week') {
    const from = startOfWeek(anchor, weekStartsOn)
    return { from, to: addDays(from, 6) }
  }
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) }
}

export function shiftPeriod(view: PeriodView, anchor: ISODate, dir: -1 | 1): ISODate {
  if (view === 'day') return addDays(anchor, dir)
  if (view === 'week') return addDays(anchor, 7 * dir)
  const [y, m] = anchor.split('-').map(Number)
  const total = y * 12 + (m - 1) + dir
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

export function inRange<T extends { date: ISODate }>(items: T[], from: ISODate, to: ISODate): T[] {
  return items.filter((i) => i.date >= from && i.date <= to)
}

/** Daily series between from..to (inclusive) with zero-filled days. */
export function dailySeries(sessions: LearningSession[], from: ISODate, to: ISODate): DayStat[] {
  const byDay = aggregateByDay(inRange(sessions, from, to))
  return eachDay(from, to).map((d) => byDay.get(d) ?? { date: d, minutes: 0, sessions: 0, count: 0 })
}

/** Weekly totals for the last `weeks` weeks ending with the week containing `today`. */
export function weeklySeries(sessions: LearningSession[], today: ISODate, weeks: number, weekStartsOn: 0 | 1 = 1) {
  const thisWeek = startOfWeek(today, weekStartsOn)
  const out: { week: ISODate; minutes: number; sessions: number; count: number }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i)
    const to = addDays(from, 6)
    const items = inRange(sessions, from, to)
    out.push({
      week: from,
      minutes: items.reduce((s, x) => s + x.minutes, 0),
      sessions: items.length,
      count: items.reduce((s, x) => s + (x.count || 0), 0),
    })
  }
  return out
}

export interface HeatCell {
  date: ISODate
  minutes: number
  sessions: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

/** GitHub-style heatmap: columns = weeks, rows = weekdays. */
export function heatmapGrid(
  sessions: Pick<LearningSession, 'date' | 'minutes' | 'count'>[],
  today: ISODate,
  weeks = 53,
  weekStartsOn: 0 | 1 = 1,
): HeatCell[][] {
  const byDay = aggregateByDay(sessions)
  const lastWeekStart = startOfWeek(today, weekStartsOn)
  const first = addDays(lastWeekStart, -7 * (weeks - 1))
  const values = [...byDay.values()].map((d) => d.minutes || d.sessions * 15).filter((v) => v > 0).sort((a, b) => a - b)
  const q = (p: number) => (values.length ? values[Math.min(values.length - 1, Math.floor(p * values.length))] : 0)
  const t1 = q(0.25)
  const t2 = q(0.5)
  const t3 = q(0.75)
  const cols: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d)
      const stat = byDay.get(date)
      const v = stat ? stat.minutes || stat.sessions * 15 : 0
      let level: HeatCell['level'] = 0
      if (v > 0) level = v <= t1 ? 1 : v <= t2 ? 2 : v <= t3 ? 3 : 4
      col.push({ date, minutes: stat?.minutes ?? 0, sessions: stat?.sessions ?? 0, level, future: date > today })
    }
    cols.push(col)
  }
  return cols
}

export function sumMinutes(sessions: { minutes: number }[]) {
  return sessions.reduce((s, x) => s + (x.minutes || 0), 0)
}

/** Totals grouped by a session attribute (e.g. language, topic, section). */
export function breakdownByAttr(sessions: LearningSession[], attr: string) {
  const m = new Map<string, { key: string; minutes: number; sessions: number; count: number }>()
  for (const s of sessions) {
    const raw = s.attrs?.[attr]
    const key = raw == null || raw === '' ? 'Unspecified' : String(raw)
    const cur = m.get(key) ?? { key, minutes: 0, sessions: 0, count: 0 }
    cur.minutes += s.minutes
    cur.sessions += 1
    cur.count += s.count || 0
    m.set(key, cur)
  }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions)
}

export interface GoalProgress {
  goal: GoalDef
  value: number
  pct: number
  from?: ISODate
  to?: ISODate
  overdue: boolean
}

export function goalProgress(
  goal: GoalDef,
  sessions: LearningSession[],
  records: TrackerRecord[],
  tracker: Pick<Tracker, 'statuses'>,
  today: ISODate,
  weekStartsOn: 0 | 1 = 1,
): GoalProgress {
  let scoped = sessions
  let from: ISODate | undefined
  let to: ISODate | undefined
  if (goal.period !== 'total') {
    const r = periodRange(goal.period, today, weekStartsOn)
    from = r.from
    to = r.to
    scoped = inRange(sessions, r.from, r.to)
  }
  let value = 0
  switch (goal.metric) {
    case 'minutes':
      value = sumMinutes(scoped)
      break
    case 'sessions':
      value = scoped.length
      break
    case 'count':
      value = scoped.reduce((s, x) => s + (x.count || 0), 0)
      break
    case 'recordsDone': {
      const doneIds = new Set(tracker.statuses.filter((s) => s.done).map((s) => s.id))
      value = records.filter((r) => r.kind === 'item' && r.status && doneIds.has(r.status)).length
      break
    }
  }
  const pct = goal.target > 0 ? Math.min(1, value / goal.target) : 0
  const overdue = !!goal.deadline && goal.deadline < today && pct < 1
  return { goal, value, pct, from, to, overdue }
}

export function recordIsDone(record: TrackerRecord, tracker: Pick<Tracker, 'statuses'>): boolean {
  return !!tracker.statuses.find((s) => s.id === record.status)?.done
}
