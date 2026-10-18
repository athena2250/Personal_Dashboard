/**
 * Template-specific analytics for the built-in Learning Hub trackers.
 * Everything is derived from the tracker's sessions and records.
 */
import { useMemo } from 'react'
import { BookMarked, CheckCircle2, CircleDashed, Clock, Code2, ExternalLink, FolderGit2, Globe, Hourglass, ListChecks, Rocket } from 'lucide-react'
import type { LearningSession, Tracker, TrackerRecord } from '@/data/models'
import { breakdownByAttr, inRange, periodRange, sumMinutes } from '@/domain/activity'
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, StatCard } from '@/components/ui/display'
import { BarsChart, DonutWithLegend } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useApp } from '@/app/AppContext'
import { formatHours, formatMinutes, relativeDays } from '@/lib/dates'
import { isSafeUrl } from '@/lib/util'

function BreakdownCard({ title, sessions, attr, metric = 'minutes', empty }: { title: string; sessions: LearningSession[]; attr: string; metric?: 'minutes' | 'count'; empty: string }) {
  const t = useChartTheme()
  const data = breakdownByAttr(sessions, attr).slice(0, 8)
  return (
    <Card>
      <CardHeader title={title} subtitle={metric === 'minutes' ? 'Time spent' : 'Count'} />
      <CardBody>
        {data.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">{empty}</p>
        ) : (
          <BarsChart
            layout="vertical"
            height={Math.max(120, data.length * 32)}
            data={data.map((d) => ({ key: d.key, value: metric === 'minutes' ? d.minutes : d.count }))}
            xKey="key"
            series={[{ key: 'value', label: metric === 'minutes' ? 'Minutes' : 'Count', color: t.series[0] }]}
            yWidth={110}
            formatY={metric === 'minutes' ? (v) => formatHours(v) : undefined}
          />
        )}
      </CardBody>
    </Card>
  )
}

/* ───────────── Coding ───────────── */

export function CodingPanels({ tracker, sessions, records }: { tracker: Tracker; sessions: LearningSession[]; records: TrackerRecord[] }) {
  const { today, settings } = useApp()
  const t = useChartTheme()
  const week = periodRange('week', today, settings.weekStartsOn)
  const problemsWeek = inRange(sessions, week.from, week.to).reduce((s, x) => s + (x.count || 0), 0)
  const problemsTotal = sessions.reduce((s, x) => s + (x.count || 0), 0)
  const diff = breakdownByAttr(sessions, 'difficulty').filter((d) => d.key !== 'Unspecified')
  const diffColors: Record<string, string> = { Easy: t.series[2], Medium: t.series[3], Hard: t.series[7], Mixed: t.series[6] }
  const links = records.filter((r) => isSafeUrl(r.values?.url as string)).slice(0, 8)
  const solved = records.filter((r) => tracker.statuses.find((s) => s.id === r.status)?.done).length
  const revisit = records.filter((r) => r.status === 'revisit').length
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Problems this week" value={problemsWeek} icon={<Code2 className="h-4 w-4" />} tone="learning" />
        <StatCard label="Problems solved (logged)" value={problemsTotal} icon={<CheckCircle2 className="h-4 w-4" />} tone="good" />
        <StatCard label="Resources completed" value={`${solved}/${records.length}`} icon={<BookMarked className="h-4 w-4" />} />
        <StatCard label="Marked to revisit" value={revisit} icon={<Hourglass className="h-4 w-4" />} tone="warn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownCard title="By language" sessions={sessions} attr="language" empty="Tag sessions with a language to see this." />
        <BreakdownCard title="By topic" sessions={sessions} attr="topic" empty="Tag sessions with a topic to see this." />
        <Card>
          <CardHeader title="Difficulty mix" subtitle="Sessions by difficulty" />
          <CardBody>
            {diff.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">Tag sessions with a difficulty to see this.</p>
            ) : (
              <DonutWithLegend size={130} data={diff.map((d, i) => ({ label: d.key, value: d.sessions, color: diffColors[d.key] ?? t.series[i % 8] }))} format={(v) => `${v}`} />
            )}
          </CardBody>
        </Card>
      </div>
      {links.length > 0 && (
        <Card>
          <CardHeader title="Links: repos, problems & resources" />
          <CardBody>
            <ul className="grid gap-2 sm:grid-cols-2">
              {links.map((r) => (
                <li key={r.id}>
                  <a href={r.values.url as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-fg-2 hover:border-line-strong hover:text-fg">
                    {r.values.type === 'Repository' ? <FolderGit2 className="h-4 w-4 text-muted" /> : <Globe className="h-4 w-4 text-muted" />}
                    <span className="truncate">{r.title}</span>
                    {typeof r.values.type === 'string' && <Badge className="ml-auto">{r.values.type}</Badge>}
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  )
}

/* ───────────── AI / ML ───────────── */

export function AimlPanels({ tracker, sessions, records }: { tracker: Tracker; sessions: LearningSession[]; records: TrackerRecord[] }) {
  const { today } = useApp()
  const items = records.filter((r) => r.kind === 'item')
  const done = items.filter((r) => tracker.statuses.find((s) => s.id === r.status)?.done)
  const inProgress = items.filter((r) => r.status === 'progress')
  const upcoming = items.filter((r) => r.status === 'planned')
  const avg = items.length ? Math.round(items.reduce((s, r) => s + (r.progress ?? (done.includes(r) ? 100 : 0)), 0) / items.length) : null
  const minutesByRecord = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sessions) if (s.recordId) m.set(s.recordId, (m.get(s.recordId) ?? 0) + s.minutes)
    return m
  }, [sessions])
  const projects = items.filter((r) => r.values?.type === 'Project' && r.milestones.length)
  const Col = ({ title, list, icon }: { title: string; list: TrackerRecord[]; icon: React.ReactNode }) => (
    <div className="rounded-xl bg-surface-2/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-2">
        {icon} {title} <span className="text-muted">({list.length})</span>
      </p>
      {list.length === 0 ? (
        <p className="py-2 text-xs text-muted">None</p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 6).map((r) => (
            <li key={r.id}>
              <p className="truncate text-sm text-fg">{r.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <ProgressBar value={(r.progress ?? 0) / 100} color={tracker.color} />
                <span className="tabular text-[11px] text-muted">{r.progress ?? 0}%</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                {(r.values?.area as string) ?? ''}
                {minutesByRecord.get(r.id) ? ` · ${formatMinutes(minutesByRecord.get(r.id)!)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completed topics" value={done.length} icon={<CheckCircle2 className="h-4 w-4" />} tone="good" />
        <StatCard label="In progress" value={inProgress.length} icon={<CircleDashed className="h-4 w-4" />} tone="learning" />
        <StatCard label="Upcoming goals" value={upcoming.length} icon={<ListChecks className="h-4 w-4" />} />
        <StatCard label="Average completion" value={avg == null ? '—' : `${avg}%`} icon={<Hourglass className="h-4 w-4" />} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Learning pipeline" subtitle="Courses, concepts, papers and projects" />
          <CardBody className="grid gap-3 md:grid-cols-3">
            <Col title="In progress" list={inProgress} icon={<CircleDashed className="h-3.5 w-3.5 text-accent" />} />
            <Col title="Up next" list={upcoming} icon={<ListChecks className="h-3.5 w-3.5 text-muted" />} />
            <Col title="Completed" list={done} icon={<CheckCircle2 className="h-3.5 w-3.5 text-good-fg" />} />
          </CardBody>
        </Card>
        <BreakdownCard title="Hours by area" sessions={sessions} attr="area" empty="Tag sessions with an area (ML, DL, GenAI, Agentic AI…)." />
      </div>
      {projects.length > 0 && (
        <Card>
          <CardHeader title="Project milestones" />
          <CardBody className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="rounded-xl border border-line p-3">
                <p className="text-sm font-medium text-fg">{p.title}</p>
                <ul className="mt-2 space-y-1">
                  {p.milestones.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-xs">
                      {m.done ? <CheckCircle2 className="h-3.5 w-3.5 text-good-fg" /> : <CircleDashed className="h-3.5 w-3.5 text-muted" />}
                      <span className={m.done ? 'text-muted line-through' : 'text-fg-2'}>{m.title}</span>
                      {m.due && !m.done && <span className={m.due < today ? 'text-bad-fg' : 'text-muted'}>· {relativeDays(m.due, today)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </>
  )
}

/* ───────────── Coding applications ───────────── */

export function AppsPanels({ tracker, sessions, records }: { tracker: Tracker; sessions: LearningSession[]; records: TrackerRecord[] }) {
  const { today } = useApp()
  const t = useChartTheme()
  const items = records.filter((r) => r.kind === 'item')
  const doneIds = new Set(tracker.statuses.filter((s) => s.done).map((s) => s.id))
  const completed = items.filter((r) => doneIds.has(r.status ?? ''))
  const active = items.filter((r) => r.status === 'active' || r.status === 'planning')
  const minutesByRecord = new Map<string, number>()
  for (const s of sessions) if (s.recordId) minutesByRecord.set(s.recordId, (minutesByRecord.get(s.recordId) ?? 0) + s.minutes)
  const byCategory = tracker.categories
    .map((c, i) => ({ label: c, value: items.filter((r) => r.category === c).length, color: t.series[i % 8] }))
    .filter((d) => d.value > 0)
  const timeByProject = items
    .map((r) => ({ key: r.title.length > 22 ? r.title.slice(0, 21) + '…' : r.title, value: minutesByRecord.get(r.id) ?? 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active projects" value={active.length} icon={<Rocket className="h-4 w-4" />} tone="learning" />
        <StatCard label="Completed" value={completed.length} icon={<CheckCircle2 className="h-4 w-4" />} tone="good" />
        <StatCard label="Total build time" value={formatHours(sumMinutes(sessions))} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Overdue" value={items.filter((r) => r.deadline && r.deadline < today && !doneIds.has(r.status ?? '')).length} icon={<Hourglass className="h-4 w-4" />} tone="warn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Active projects" subtitle="Progress, next action and deadline" />
          <CardBody>
            {active.length === 0 ? (
              <EmptyState compact title="No active projects" description="Set a project's status to Building or Planning." />
            ) : (
              <ul className="divide-y divide-line">
                {active.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-fg">{r.title}</span>
                      <span className="flex items-center gap-2 text-xs">
                        {r.category && <Badge>{r.category}</Badge>}
                        {isSafeUrl(r.values?.repoUrl as string) && (
                          <a href={r.values.repoUrl as string} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            Repo ↗
                          </a>
                        )}
                        {isSafeUrl(r.values?.deployUrl as string) && (
                          <a href={r.values.deployUrl as string} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            Live ↗
                          </a>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar value={(r.progress ?? 0) / 100} color={tracker.color} />
                      <span className="tabular text-xs text-muted">{r.progress ?? 0}%</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {r.values?.nextAction ? `Next: ${r.values.nextAction as string}` : 'No next action set'}
                      {r.deadline ? ` · Due ${relativeDays(r.deadline, today)}` : ''}
                      {minutesByRecord.get(r.id) ? ` · ${formatMinutes(minutesByRecord.get(r.id)!)} logged` : ''}
                    </p>
                    {typeof r.values?.stack === 'string' && <p className="mt-1 text-[11px] text-muted">Stack: {r.values.stack}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="By category" />
            <CardBody>{byCategory.length ? <DonutWithLegend size={120} data={byCategory} format={(v) => `${v}`} /> : <p className="py-4 text-center text-xs text-muted">Assign categories to projects.</p>}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Time by project" />
            <CardBody>
              {timeByProject.length ? (
                <BarsChart layout="vertical" height={Math.max(100, timeByProject.length * 30)} data={timeByProject} xKey="key" series={[{ key: 'value', label: 'Minutes', color: t.series[0] }]} yWidth={120} formatY={(v) => formatHours(v)} />
              ) : (
                <p className="py-4 text-center text-xs text-muted">Link sessions to a project to see time per project.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
