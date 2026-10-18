import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Clock, Flame, Pencil, Plus, Timer, Trash2, Trophy, CalendarCheck } from 'lucide-react'
import { useRecords, useSessions, useTracker, useTrackers } from '@/data/hooks'
import { deleteTracker, setTrackerArchived } from '@/data/repos/trackers'
import { computeStreaks, dailySeries, inRange, periodRange, shiftPeriod, sumMinutes, weeklySeries, type PeriodView } from '@/domain/activity'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, Delta, EmptyState, Loading, PageHeader, Segmented, StatCard, TabNav, Badge } from '@/components/ui/display'
import { TrackerIcon } from '@/components/ui/Icon'
import { Heatmap } from '@/components/charts/Heatmap'
import { BarsChart } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { SessionFormModal } from '@/modules/learning/SessionForm'
import { formatDate, formatHours, formatMinutes } from '@/lib/dates'
import { changePct } from '@/domain/spending'
import { SessionLog, periodLabel } from './SessionLog'
import { RecordsView } from './RecordsView'
import { GoalsPanel } from './GoalsPanel'
import { AimlPanels, AppsPanels, CodingPanels } from './templatePanels'
import { MockTests, RevisionSchedule, TestPrepOverview, Vocabulary } from './TestPrep'

type Tab = 'overview' | 'log' | 'records' | 'mocks' | 'vocab' | 'revision' | 'goals'

export function TrackerPage() {
  const { id } = useParams()
  const tracker = useTracker(id)
  const trackers = useTrackers({ includeArchived: true })
  const sessions = useSessions(id)
  const records = useRecords(id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || (params.get('record') ? 'records' : 'overview')
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const [logging, setLogging] = useState(false)
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()

  if (tracker === undefined || !sessions || !records || !trackers) return <Loading />
  if (!tracker) return <EmptyState title="Tracker not found" description="It may have been deleted." action={<ButtonLink to="/trackers">All trackers</ButtonLink>} />

  const items = records.filter((r) => r.kind === 'item')
  const recordLabel = tracker.recordLabel || 'Item'
  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'log', label: 'Activity log' },
    { value: 'records', label: `${recordLabel}s` },
    ...(tracker.template === 'testprep'
      ? ([
          { value: 'mocks', label: 'Mock tests' },
          { value: 'vocab', label: 'Vocabulary' },
          { value: 'revision', label: 'Revision schedule' },
        ] as { value: Tab; label: string }[])
      : []),
    { value: 'goals', label: 'Goals' },
  ]

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${tracker.name}”?`,
      message: (
        <>
          This permanently deletes the tracker, its <strong>{records.length}</strong> records and <strong>{sessions.length}</strong> logged sessions. Consider archiving instead, or export your data first.
        </>
      ),
      confirmLabel: 'Delete permanently',
      danger: true,
      typeToConfirm: tracker.name,
    })
    if (!ok) return
    try {
      await deleteTracker(tracker.id)
      toast.success('Tracker deleted')
      navigate(tracker.section === 'learning' ? '/learning' : '/trackers')
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={tracker.section === 'learning' ? 'Learning Hub' : 'Collection'}
        title={
          <span className="flex items-center gap-2">
            {tracker.name}
            {tracker.archived && <Badge tone="warn">Archived</Badge>}
          </span>
        }
        subtitle={tracker.description}
        icon={<TrackerIcon name={tracker.icon} color={tracker.color} size="lg" />}
        actions={
          <>
            <ButtonLink to={`/trackers/${tracker.id}/edit`} size="sm" icon={<Pencil className="h-3.5 w-3.5" />}>
              Customize
            </ButtonLink>
            <Button
              size="sm"
              variant="ghost"
              icon={tracker.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              onClick={async () => {
                if (!tracker.archived && !(await confirm({ title: `Archive “${tracker.name}”?`, message: 'It will be hidden from navigation and dashboards. Data is kept and you can restore it from All trackers.', confirmLabel: 'Archive' }))) return
                setTrackerArchived(tracker.id, !tracker.archived)
                  .then(() => toast.success(tracker.archived ? 'Tracker restored' : 'Tracker archived'))
                  .catch(toast.error)
              }}
            >
              {tracker.archived ? 'Restore' : 'Archive'}
            </Button>
            <Button size="sm" variant="ghost" className="text-bad-fg" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={remove}>
              Delete
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLogging(true)}>
              Log session
            </Button>
          </>
        }
      />
      <TabNav value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'overview' && <Overview tracker={tracker} sessions={sessions} records={records} />}
      {tab === 'log' && <SessionLog sessions={sessions} trackers={trackers} trackerId={tracker.id} highlightId={params.get('highlight')} />}
      {tab === 'records' && <RecordsView tracker={tracker} records={items} sessions={sessions} openRecordId={params.get('record')} onOpened={() => setParams({ tab: 'records' }, { replace: true })} />}
      {tab === 'mocks' && <MockTests tracker={tracker} records={records} />}
      {tab === 'vocab' && <Vocabulary tracker={tracker} records={records} />}
      {tab === 'revision' && <RevisionSchedule tracker={tracker} records={records} />}
      {tab === 'goals' && (
        <div className="max-w-2xl">
          <GoalsPanel tracker={tracker} sessions={sessions} records={records} />
        </div>
      )}
      <SessionFormModal open={logging} onClose={() => setLogging(false)} trackerId={tracker.id} />
    </div>
  )
}

function Overview({ tracker, sessions, records }: { tracker: import('@/data/models').Tracker; sessions: import('@/data/models').LearningSession[]; records: import('@/data/models').TrackerRecord[] }) {
  const { today, settings } = useApp()
  const t = useChartTheme()
  const [view, setView] = useState<PeriodView>('week')
  const [anchor, setAnchor] = useState(today)
  const range = periodRange(view, anchor, settings.weekStartsOn)
  const prevRange = periodRange(view, shiftPeriod(view, anchor, -1), settings.weekStartsOn)
  const inPeriod = inRange(sessions, range.from, range.to)
  const inPrev = inRange(sessions, prevRange.from, prevRange.to)
  const streak = useMemo(() => computeStreaks(sessions.map((s) => s.date), today), [sessions, today])
  const series = view === 'day' ? weeklySeries(sessions, anchor, 12, settings.weekStartsOn).map((w) => ({ label: formatDate(w.week, 'short'), minutes: w.minutes })) : dailySeries(sessions, range.from, range.to).map((d) => ({ label: view === 'week' ? formatDate(d.date, 'weekday').split(',')[0] : String(Number(d.date.slice(8))), minutes: d.minutes }))
  const count = inPeriod.reduce((s, x) => s + (x.count || 0), 0)

  if (sessions.length === 0 && records.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <EmptyState
            icon={<Timer className="h-5 w-5" />}
            title={`Start tracking ${tracker.name}`}
            description={`Log a session to start your streak, or add ${tracker.recordLabel.toLowerCase() || 'item'}s to plan your work. Everything here is calculated from what you record.`}
          />
        </Card>
        <GoalsPanel tracker={tracker} sessions={sessions} records={records} compact />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Current streak" value={`${streak.current} day${streak.current === 1 ? '' : 's'}`} sub={streak.atRisk ? 'Log today to keep it' : streak.current ? 'Keep going!' : 'Log a session to start'} icon={<Flame className="h-4 w-4" />} tone="warn" />
        <StatCard label="Longest streak" value={`${streak.longest} days`} icon={<Trophy className="h-4 w-4" />} tone="learning" />
        <StatCard label="Total practice" value={formatHours(sumMinutes(sessions))} sub={`${sessions.length} sessions`} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Active days" value={streak.activeDays} icon={<CalendarCheck className="h-4 w-4" />} tone="good" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Progress</h3>
              <p className="text-xs text-muted">{periodLabel(view, range.from, range.to)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon-sm" variant="ghost" aria-label="Previous period" onClick={() => setAnchor(shiftPeriod(view, anchor, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Segmented
                size="sm"
                value={view}
                onChange={(v) => {
                  setView(v)
                  setAnchor(today)
                }}
                options={[
                  { value: 'day', label: 'Daily' },
                  { value: 'week', label: 'Weekly' },
                  { value: 'month', label: 'Monthly' },
                ]}
              />
              <Button size="icon-sm" variant="ghost" aria-label="Next period" onClick={() => setAnchor(shiftPeriod(view, anchor, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardBody className="pt-4">
            <div className="mb-4 flex flex-wrap gap-6">
              <div>
                <div className="text-2xl font-semibold text-fg">{formatMinutes(sumMinutes(inPeriod))}</div>
                <Delta value={changePct(sumMinutes(inPeriod), sumMinutes(inPrev))} suffix={`vs previous ${view}`} />
              </div>
              <div>
                <div className="text-2xl font-semibold text-fg">{inPeriod.length}</div>
                <div className="text-xs text-muted">sessions</div>
              </div>
              {tracker.countLabel && (
                <div>
                  <div className="text-2xl font-semibold text-fg">{count}</div>
                  <div className="text-xs text-muted">{tracker.countLabel.toLowerCase()}</div>
                </div>
              )}
            </div>
            {view === 'day' ? (
              inPeriod.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No sessions on {formatDate(anchor, 'long')}.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {inPeriod.map((s) => (
                    <li key={s.id} className="flex justify-between py-2 text-sm">
                      <span className="text-fg">{s.title}</span>
                      <span className="text-fg-2">{formatMinutes(s.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <BarsChart height={200} data={series} xKey="label" series={[{ key: 'minutes', label: 'Minutes', color: tracker.color || t.series[0] }]} formatY={(v) => formatMinutes(v)} yWidth={44} />
            )}
          </CardBody>
        </Card>
        <GoalsPanel tracker={tracker} sessions={sessions} records={records} />
      </div>
      <Card>
        <CardHeader title="Activity heatmap" subtitle="Last 12 months" />
        <CardBody>
          <Heatmap sessions={sessions} today={today} weekStartsOn={settings.weekStartsOn} onSelectDay={(d) => { setView('day'); setAnchor(d) }} />
        </CardBody>
      </Card>
      {tracker.template === 'coding' && <CodingPanels tracker={tracker} sessions={sessions} records={records.filter((r) => r.kind === 'item')} />}
      {tracker.template === 'aiml' && <AimlPanels tracker={tracker} sessions={sessions} records={records} />}
      {tracker.template === 'apps' && <AppsPanels tracker={tracker} sessions={sessions} records={records} />}
      {tracker.template === 'testprep' && <TestPrepOverview tracker={tracker} sessions={sessions} records={records} />}
    </div>
  )
}
