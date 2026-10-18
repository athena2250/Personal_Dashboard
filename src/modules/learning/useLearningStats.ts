import { useMemo } from 'react'
import { useSessions, useTrackers } from '@/data/hooks'
import type { LearningSession, Tracker } from '@/data/models'
import { computeStreaks, inRange, periodRange, sumMinutes, weeklySeries, dailySeries } from '@/domain/activity'
import { addDays } from '@/lib/dates'

export interface LearningStats {
  trackers: Tracker[]
  sessions: LearningSession[]
  streak: ReturnType<typeof computeStreaks>
  todayMinutes: number
  weekMinutes: number
  lastWeekMinutes: number
  weekGoalMinutes: number
  totalMinutes: number
  weekDaily: ReturnType<typeof dailySeries>
  weekly: ReturnType<typeof weeklySeries>
  byTracker: { tracker: Tracker; weekMinutes: number; totalMinutes: number; streak: number; sessions: number }[]
}

/** Weekly minute goal implied by a tracker's goals (weekly minute goals + 7 × daily minute goals). */
export function weeklyMinuteGoal(t: Tracker): number {
  return t.goals.reduce((s, g) => (g.metric !== 'minutes' ? s : g.period === 'week' ? s + g.target : g.period === 'day' ? s + g.target * 7 : s), 0)
}

/** Unified Learning Hub statistics computed from the learning activity log. */
export function useLearningStats(today: string, weekStartsOn: 0 | 1): LearningStats | undefined {
  const trackers = useTrackers()
  const allSessions = useSessions()
  return useMemo(() => {
    if (!trackers || !allSessions) return undefined
    const learning = trackers.filter((t) => t.section === 'learning')
    const ids = new Set(learning.map((t) => t.id))
    const sessions = allSessions.filter((s) => ids.has(s.trackerId))
    const week = periodRange('week', today, weekStartsOn)
    const weekSessions = inRange(sessions, week.from, week.to)
    const lastWeek = inRange(sessions, addDays(week.from, -7), addDays(week.to, -7))
    return {
      trackers: learning,
      sessions,
      streak: computeStreaks(sessions.map((s) => s.date), today),
      todayMinutes: sumMinutes(sessions.filter((s) => s.date === today)),
      weekMinutes: sumMinutes(weekSessions),
      lastWeekMinutes: sumMinutes(lastWeek),
      weekGoalMinutes: learning.reduce((s, t) => s + weeklyMinuteGoal(t), 0),
      totalMinutes: sumMinutes(sessions),
      weekDaily: dailySeries(sessions, week.from, week.to),
      weekly: weeklySeries(sessions, today, 12, weekStartsOn),
      byTracker: learning.map((t) => {
        const ts = sessions.filter((s) => s.trackerId === t.id)
        return {
          tracker: t,
          weekMinutes: sumMinutes(inRange(ts, week.from, week.to)),
          totalMinutes: sumMinutes(ts),
          streak: computeStreaks(ts.map((s) => s.date), today).current,
          sessions: ts.length,
        }
      }),
    }
  }, [trackers, allSessions, today, weekStartsOn])
}
