import { describe, expect, it } from 'vitest'
import { computeStreaks, goalProgress, heatmapGrid, periodRange, weeklySeries, breakdownByAttr } from '../activity'
import type { LearningSession, Tracker, TrackerRecord } from '@/data/models'

const s = (date: string, minutes = 30, extra: Partial<LearningSession> = {}): LearningSession => ({
  id: date + minutes + Math.random(),
  createdAt: '',
  updatedAt: '',
  trackerId: 't',
  date,
  minutes,
  title: 'x',
  attrs: {},
  ...extra,
})

describe('computeStreaks', () => {
  it('returns zeros with no activity', () => {
    expect(computeStreaks([], '2026-05-10')).toEqual({ current: 0, longest: 0, activeDays: 0, atRisk: false })
  })

  it('counts a streak ending today', () => {
    const r = computeStreaks(['2026-05-08', '2026-05-09', '2026-05-10'], '2026-05-10')
    expect(r.current).toBe(3)
    expect(r.longest).toBe(3)
    expect(r.atRisk).toBe(false)
  })

  it('keeps the streak alive (at risk) when only yesterday has activity', () => {
    const r = computeStreaks(['2026-05-08', '2026-05-09'], '2026-05-10')
    expect(r.current).toBe(2)
    expect(r.atRisk).toBe(true)
  })

  it('breaks the streak after a missed day', () => {
    const r = computeStreaks(['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-07'], '2026-05-10')
    expect(r.current).toBe(0)
    expect(r.longest).toBe(3)
    expect(r.activeDays).toBe(4)
  })

  it('dedupes multiple sessions per day and ignores future dates', () => {
    const r = computeStreaks(['2026-05-10', '2026-05-10', '2026-05-09', '2026-05-12'], '2026-05-10')
    expect(r.current).toBe(2)
    expect(r.activeDays).toBe(2)
  })

  it('handles month and DST boundaries', () => {
    const r = computeStreaks(['2026-02-28', '2026-03-01', '2026-03-29', '2026-03-30'], '2026-03-30')
    expect(r.current).toBe(2)
    expect(r.longest).toBe(2)
  })
})

describe('periods & series', () => {
  it('computes week ranges starting Monday', () => {
    expect(periodRange('week', '2026-10-18', 1)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(periodRange('week', '2026-10-18', 0)).toEqual({ from: '2026-10-18', to: '2026-10-24' })
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('weekly series sums minutes', () => {
    const w = weeklySeries([s('2026-10-12', 30), s('2026-10-18', 45), s('2026-10-05', 10)], '2026-10-18', 2, 1)
    expect(w).toEqual([
      { week: '2026-10-05', minutes: 10, sessions: 1, count: 0 },
      { week: '2026-10-12', minutes: 75, sessions: 2, count: 0 },
    ])
  })

  it('heatmap has weeks x 7 cells and marks future days', () => {
    const grid = heatmapGrid([s('2026-10-14', 60)], '2026-10-14', 4, 1)
    expect(grid).toHaveLength(4)
    expect(grid.every((c) => c.length === 7)).toBe(true)
    const cell = grid.flat().find((c) => c.date === '2026-10-14')!
    expect(cell.level).toBeGreaterThan(0)
    expect(grid.flat().find((c) => c.date === '2026-10-15')!.future).toBe(true)
  })

  it('breaks down by attribute', () => {
    const b = breakdownByAttr([s('2026-01-01', 30, { attrs: { language: 'Go' } }), s('2026-01-02', 60, { attrs: { language: 'Go' } }), s('2026-01-03', 10)], 'language')
    expect(b[0]).toMatchObject({ key: 'Go', minutes: 90, sessions: 2 })
    expect(b[1].key).toBe('Unspecified')
  })
})

describe('goalProgress', () => {
  const tracker = { statuses: [{ id: 'done', name: 'Done', color: '', done: true }, { id: 'todo', name: 'Todo', color: '' }] } as Pick<Tracker, 'statuses'>
  it('weekly minutes', () => {
    const g = goalProgress({ id: 'g', title: '', metric: 'minutes', period: 'week', target: 120 }, [s('2026-10-13', 60), s('2026-10-01', 500)], [], tracker, '2026-10-14')
    expect(g.value).toBe(60)
    expect(g.pct).toBe(0.5)
  })
  it('records done', () => {
    const recs = [{ kind: 'item', status: 'done' }, { kind: 'item', status: 'todo' }, { kind: 'mock', status: 'done' }] as TrackerRecord[]
    const g = goalProgress({ id: 'g', title: '', metric: 'recordsDone', period: 'total', target: 4, deadline: '2026-01-01' }, [], recs, tracker, '2026-10-14')
    expect(g.value).toBe(1)
    expect(g.overdue).toBe(true)
  })
})
