import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarCheck, Clock, Download, Flame, GraduationCap, Plus, Target, Trophy } from 'lucide-react'
import { useTrackers } from '@/data/hooks'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, Delta, Loading, PageHeader, ProgressBar, Segmented, StatCard } from '@/components/ui/display'
import { TrackerIcon } from '@/components/ui/Icon'
import { Heatmap } from '@/components/charts/Heatmap'
import { BarsChart, DonutWithLegend, Sparkline } from '@/components/charts/Charts'
import { useApp } from '@/app/AppContext'
import { useQuickAdd } from '@/app/QuickAdd'
import { inRange, periodRange, sumMinutes, weeklySeries, type PeriodView } from '@/domain/activity'
import { changePct } from '@/domain/spending'
import { formatDate, formatHours, formatMinutes } from '@/lib/dates'
import { SessionLog } from '@/modules/trackers/SessionLog'
import { exportSessionsCsv } from '@/modules/trackers/exportRecords'
import { useLearningStats, weeklyMinuteGoal } from './useLearningStats'

export function LearningHubPage() {
  const { today, settings } = useApp()
  const stats = useLearningStats(today, settings.weekStartsOn)
  const allTrackers = useTrackers()
  const quick = useQuickAdd()
  const [view, setView] = useState<PeriodView>('week')

  const distribution = useMemo(() => {
    if (!stats) return []
    const r = periodRange(view, today, settings.weekStartsOn)
    return stats.trackers
      .map((t) => ({ label: t.name, value: sumMinutes(inRange(stats.sessions.filter((s) => s.trackerId === t.id), r.from, r.to)), color: t.color }))
      .filter((d) => d.value > 0)
  }, [stats, view, today, settings.weekStartsOn])

  const stacked = useMemo(() => {
    if (!stats) return []
    const weeks = weeklySeries(stats.sessions, today, 12, settings.weekStartsOn)
    return weeks.map((w) => {
      const row: Record<string, unknown> = { week: formatDate(w.week, 'short') }
      for (const t of stats.trackers) row[t.id] = sumMinutes(inRange(stats.sessions.filter((s) => s.trackerId === t.id), w.week, addDaysLocal(w.week, 6)))
      return row
    })
  }, [stats, today, settings.weekStartsOn])

  if (!stats || !allTrackers) return <Loading />

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="Dashboard"
        title="Learning Hub"
        subtitle="Coding, AI/ML, projects and test prep — one unified activity log."
        icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-learning-soft text-learning"><GraduationCap className="h-6 w-6" /></span>}
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportSessionsCsv(stats.sessions, stats.trackers, 'learning-hub-log')} disabled={!stats.sessions.length}>
              Export log
            </Button>
            <ButtonLink to="/trackers/new?section=learning" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
              New tracker
            </ButtonLink>
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => quick('session')}>
              Log session
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Learning streak" value={`${stats.streak.current} days`} sub={stats.streak.atRisk ? 'Log today to keep it alive' : `Longest: ${stats.streak.longest} days`} icon={<Flame className="h-4 w-4" />} tone="warn" />
        <StatCard
          label="This week"
          value={formatHours(stats.weekMinutes)}
          sub={<Delta value={changePct(stats.weekMinutes, stats.lastWeekMinutes)} suffix="vs last week" />}
          icon={<Clock className="h-4 w-4" />}
          tone="learning"
        />
        <StatCard label="Weekly goal" value={stats.weekGoalMinutes ? `${Math.round((stats.weekMinutes / stats.weekGoalMinutes) * 100)}%` : '—'} sub={stats.weekGoalMinutes ? `${formatHours(stats.weekMinutes)} of ${formatHours(stats.weekGoalMinutes)}` : 'Set minute goals on trackers'} icon={<Target className="h-4 w-4" />} tone="accent" />
        <StatCard label="Total learning" value={formatHours(stats.totalMinutes)} sub={`${stats.sessions.length} sessions · ${stats.streak.activeDays} active days`} icon={<Trophy className="h-4 w-4" />} tone="good" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.byTracker.map(({ tracker: t, weekMinutes, totalMinutes, streak, sessions }) => {
          const goal = weeklyMinuteGoal(t)
          const spark = weeklySeries(stats.sessions.filter((s) => s.trackerId === t.id), today, 10, settings.weekStartsOn).map((w) => w.minutes)
          return (
            <Link key={t.id} to={`/trackers/${t.id}`} className="group rounded-2xl border border-line bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-line-strong">
              <div className="flex items-center gap-3">
                <TrackerIcon name={t.icon} color={t.color} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{t.name}</p>
                  <p className="text-xs text-muted">
                    {sessions} sessions · {formatHours(totalMinutes)}
                  </p>
                </div>
                {streak > 0 && (
                  <span className="ml-auto flex items-center gap-0.5 text-xs font-medium text-orange-400">
                    <Flame className="h-3.5 w-3.5" />
                    {streak}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <Sparkline values={spark} color={t.color} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-fg-2">{formatMinutes(weekMinutes)} this week</span>
                {goal > 0 && <span className="text-muted">goal {formatHours(goal)}</span>}
              </div>
              {goal > 0 && <ProgressBar className="mt-1.5" value={weekMinutes / goal} color={t.color} />}
            </Link>
          )
        })}
        <Link to="/trackers/new?section=learning" className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-muted transition-colors hover:border-[var(--learning)] hover:text-fg">
          <Plus className="h-5 w-5" />
          Add a tracker (books, certifications…)
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Weekly learning time" subtitle="Last 12 weeks, by tracker" />
          <CardBody>
            {stats.sessions.length ? (
              <BarsChart height={240} stacked showLegend data={stacked} xKey="week" series={stats.trackers.map((t) => ({ key: t.id, label: t.name, color: t.color }))} formatY={(v) => formatHours(v)} yWidth={40} />
            ) : (
              <p className="py-12 text-center text-sm text-muted">Log sessions to see your weekly trend.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Time distribution"
            action={
              <Segmented
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
              />
            }
          />
          <CardBody>
            {distribution.length ? (
              <DonutWithLegend size={140} data={distribution} format={(v) => formatMinutes(v)} center={<><span className="text-base font-semibold text-fg">{formatHours(distribution.reduce((s, d) => s + d.value, 0))}</span><span className="text-[10px] text-muted">total</span></>} />
            ) : (
              <p className="py-12 text-center text-sm text-muted">No learning logged this {view}.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Unified activity heatmap" subtitle="Every session from every learning tracker" icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-learning-soft text-learning"><CalendarCheck className="h-4 w-4" /></span>} />
        <CardBody>
          <Heatmap sessions={stats.sessions} today={today} weekStartsOn={settings.weekStartsOn} />
        </CardBody>
      </Card>

      <SessionLog sessions={stats.sessions} trackers={stats.trackers} title="Unified learning log" />
    </div>
  )
}

function addDaysLocal(d: string, n: number) {
  return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
}
