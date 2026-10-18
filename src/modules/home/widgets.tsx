import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckSquare,
  Clock,
  Flame,
  GraduationCap,
  ListTodo,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { db } from '@/data/db'
import { useBudgets, useInvestments, useInvTxns, useTasks, useTrackers, useTransactions, useValuations, useSessions } from '@/data/hooks'
import type { Task } from '@/data/models'
import { deleteTask, toggleTask } from '@/data/repos/tasks'
import { Card, CardBody, CardHeader, Delta, EmptyState, ProgressBar, ProgressRing, Badge } from '@/components/ui/display'
import { Button, ButtonLink } from '@/components/ui/Button'
import { BarsChart } from '@/components/charts/Charts'
import { Heatmap } from '@/components/charts/Heatmap'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { TrackerIcon } from '@/components/ui/Icon'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { useQuickAdd } from '@/app/QuickAdd'
import { useLearningStats } from '@/modules/learning/useLearningStats'
import { buildInstances } from '@/modules/events/calendarModel'
import { TaskFormModal } from './TaskForm'
import { monthSummary, overallBudget, changePct } from '@/domain/spending'
import { portfolioSummary } from '@/domain/wealth'
import { addDays, addMonthKey, formatDate, formatHours, formatMinutes, monthKey, relativeDays, weekdayShort, dayOfWeek } from '@/lib/dates'
import { formatTime, getAppTimezone } from '@/lib/tz'
import { formatPct } from '@/lib/money'
import { cn } from '@/lib/util'
import { inRange, sumMinutes, periodRange } from '@/domain/activity'

export function QuickActionsWidget() {
  const quick = useQuickAdd()
  const actions = [
    { kind: 'task' as const, label: 'Add task', icon: ListTodo, color: 'var(--accent)' },
    { kind: 'session' as const, label: 'Log learning', icon: GraduationCap, color: 'var(--learning)' },
    { kind: 'expense' as const, label: 'Add expense', icon: Receipt, color: 'var(--spending)' },
    { kind: 'invEntry' as const, label: 'Investment entry', icon: TrendingUp, color: 'var(--wealth)' },
    { kind: 'event' as const, label: 'Add event', icon: CalendarPlus, color: 'var(--events)' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {actions.map((a) => (
        <button
          key={a.kind}
          onClick={() => quick(a.kind)}
          className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left text-sm font-medium text-fg shadow-card transition-all hover:-translate-y-0.5 hover:border-line-strong"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${a.color} 15%, transparent)`, color: a.color }}>
            <a.icon className="h-4.5 w-4.5" />
          </span>
          {a.label}
          <Plus className="ml-auto h-4 w-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ))}
    </div>
  )
}

function TaskRow({ task, today, onEdit }: { task: Task; today: string; onEdit: (t: Task) => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const overdue = !task.done && task.dueDate && task.dueDate < today
  return (
    <li className="group flex items-center gap-3 py-2">
      <button
        onClick={() => toggleTask(task).catch(toast.error)}
        aria-label={task.done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
        className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors', task.done ? 'border-transparent bg-good text-white' : 'border-line-strong hover:border-[var(--accent)]')}
      >
        {task.done && <Check className="h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', task.done ? 'text-muted line-through' : 'text-fg')}>{task.title}</p>
        {task.dueDate && <p className={cn('text-[11px]', overdue ? 'text-bad-fg' : 'text-muted')}>{overdue ? 'Overdue · ' : ''}{relativeDays(task.dueDate, today)}</p>}
      </div>
      {task.priority === 'high' && !task.done && <Badge tone="bad">High</Badge>}
      <div className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <Button variant="ghost" size="icon-sm" aria-label="Edit task" onClick={() => onEdit(task)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete task"
          onClick={async () => {
            if (await confirm({ title: 'Delete task?', message: `"${task.title}" will be permanently deleted.`, confirmLabel: 'Delete', danger: true })) deleteTask(task.id).then(() => toast.success('Task deleted')).catch(toast.error)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  )
}

export function TodayWidget({ openTaskId }: { openTaskId?: string | null }) {
  const { today, settings } = useApp()
  const tasks = useTasks()
  const events = useLiveQuery(() => db.events.toArray(), [])
  const quick = useQuickAdd()
  const [editing, setEditing] = useState<Task | undefined>()
  const [showDone, setShowDone] = useState(false)
  const tz = getAppTimezone()

  const linked = openTaskId ? tasks?.find((t) => t.id === openTaskId) : undefined
  const [handledLink, setHandledLink] = useState<string | null>(null)
  if (linked && handledLink !== linked.id) {
    setHandledLink(linked.id)
    setEditing(linked)
  }

  const open = (tasks ?? []).filter((t) => !t.done).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.priority === 'high' ? -1 : 1))
  const dueNow = open.filter((t) => !t.dueDate || t.dueDate <= today)
  const later = open.filter((t) => t.dueDate && t.dueDate > today).slice(0, 4)
  const doneToday = (tasks ?? []).filter((t) => t.done && t.doneAt && t.doneAt.slice(0, 10) >= addDays(today, -1))
  const todays = useMemo(() => (events ? buildInstances(events, today, today, tz, settings.eventCategories) : []), [events, today, tz, settings.eventCategories])

  return (
    <Card className="h-full">
      <CardHeader
        title="Today"
        subtitle={`${dueNow.length} task${dueNow.length === 1 ? '' : 's'} to do · ${todays.length} event${todays.length === 1 ? '' : 's'}`}
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent"><CheckSquare className="h-4 w-4" /></span>}
        action={
          <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => quick('task')}>
            Task
          </Button>
        }
      />
      <CardBody className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
        <div>
          {tasks && open.length === 0 && doneToday.length === 0 ? (
            <EmptyState compact icon={<ListTodo className="h-5 w-5" />} title="No open tasks" description="Add tasks for today and they'll show up here." action={<Button size="sm" onClick={() => quick('task')}>Add a task</Button>} />
          ) : (
            <>
              <ul className="divide-y divide-line">
                {dueNow.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onEdit={setEditing} />
                ))}
              </ul>
              {later.length > 0 && (
                <>
                  <p className="mt-3 mb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Coming up</p>
                  <ul className="divide-y divide-line">
                    {later.map((t) => (
                      <TaskRow key={t.id} task={t} today={today} onEdit={setEditing} />
                    ))}
                  </ul>
                </>
              )}
              {doneToday.length > 0 && (
                <button className="mt-2 text-xs text-muted hover:text-fg" onClick={() => setShowDone((s) => !s)}>
                  {showDone ? 'Hide' : 'Show'} {doneToday.length} recently completed
                </button>
              )}
              {showDone && (
                <ul className="divide-y divide-line">
                  {doneToday.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} onEdit={setEditing} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-2">
            <CalendarDays className="h-3.5 w-3.5 text-events" /> {formatDate(today, 'weekday')}
          </p>
          {todays.length === 0 ? (
            <p className="py-3 text-xs text-muted">Nothing scheduled today.</p>
          ) : (
            <ul className="space-y-2">
              {todays.map((i) => (
                <li key={i.key}>
                  <Link to={`/events?event=${i.event.id}&date=${i.startDate}`} className="flex gap-2.5 rounded-lg p-1 hover:bg-surface-3/60">
                    <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: i.color }} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">{i.event.title}</span>
                      <span className="text-[11px] text-muted">{i.allDay ? 'All day' : `${formatTime(i.start, tz)} – ${formatTime(i.end, tz)}`}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
      <TaskFormModal open={!!editing} onClose={() => setEditing(undefined)} task={editing} />
    </Card>
  )
}

export function LearningWidget() {
  const { today, settings } = useApp()
  const stats = useLearningStats(today, settings.weekStartsOn)
  const quick = useQuickAdd()
  const theme = useChartTheme()
  const t = stats
  return (
    <Card className="h-full">
      <CardHeader
        title="Learning"
        subtitle="This week across all learning trackers"
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-learning-soft text-learning"><GraduationCap className="h-4 w-4" /></span>}
        action={
          <ButtonLink to="/learning" size="sm" variant="ghost">
            Open <ArrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
        }
      />
      <CardBody>
        {!t ? null : t.sessions.length === 0 ? (
          <EmptyState compact icon={<Flame className="h-5 w-5" />} title="Start your streak" description="Log your first coding, AI/ML, project or test-prep session." action={<Button size="sm" onClick={() => quick('session')}>Log a session</Button>} />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <ProgressRing value={t.weekGoalMinutes ? t.weekMinutes / t.weekGoalMinutes : 0} size={76} color="var(--learning)">
                <div>
                  <div className="text-sm font-semibold text-fg">{formatHours(t.weekMinutes)}</div>
                  <div className="text-[10px] text-muted">{t.weekGoalMinutes ? `of ${formatHours(t.weekGoalMinutes)}` : 'this week'}</div>
                </div>
              </ProgressRing>
              <div className="grid flex-1 grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-1 text-xl font-semibold text-fg">
                    <Flame className={cn('h-4.5 w-4.5', t.streak.current > 0 ? 'text-orange-400' : 'text-muted')} />
                    {t.streak.current}
                  </div>
                  <div className="text-[11px] text-muted">day streak{t.streak.atRisk ? ' · log today!' : ''}</div>
                </div>
                <div>
                  <div className="text-xl font-semibold text-fg">{formatMinutes(t.todayMinutes)}</div>
                  <div className="text-[11px] text-muted">today</div>
                </div>
                <div className="col-span-2">
                  <Delta value={changePct(t.weekMinutes, t.lastWeekMinutes)} suffix="vs last week" />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <BarsChart
                height={110}
                data={t.weekDaily.map((d) => ({ day: weekdayShort(dayOfWeek(d.date)).slice(0, 2), minutes: d.minutes, date: d.date }))}
                xKey="day"
                series={[{ key: 'minutes', label: 'Minutes', color: theme.learning }]}
                yWidth={34}
                formatY={(v) => formatHours(v)}
              />
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}

export function SpendingWidget() {
  const { today, money, settings } = useApp()
  const txs = useTransactions()
  const budgets = useBudgets()
  const quick = useQuickAdd()
  const month = monthKey(today)
  const s = useMemo(() => (txs ? monthSummary(txs, month) : null), [txs, month])
  const prev = useMemo(() => (txs ? monthSummary(txs, addMonthKey(month, -1)) : null), [txs, month])
  const budget = budgets ? overallBudget(budgets, month) : null
  const util = budget && s ? s.expenses / budget.amount : 0
  return (
    <Card className="h-full">
      <CardHeader
        title="Spending"
        subtitle={new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(new Date(today + 'T00:00:00Z'))}
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-spending-soft text-spending"><Wallet className="h-4 w-4" /></span>}
        action={
          <ButtonLink to="/spending" size="sm" variant="ghost">
            Open <ArrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
        }
      />
      <CardBody>
        {txs && txs.length === 0 ? (
          <EmptyState compact icon={<Receipt className="h-5 w-5" />} title="No transactions yet" description="Record expenses or import a bank CSV." action={<Button size="sm" onClick={() => quick('expense')}>Add expense</Button>} />
        ) : (
          s && (
            <>
              <div className="text-xs text-muted">Spent this month</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-fg">{money(s.expenses, { decimals: 0 })}</span>
                <Delta value={prev ? changePct(s.expenses, prev.expenses) : null} invert suffix="vs last month" />
              </div>
              {budget ? (
                <div className="mt-4">
                  <ProgressBar value={util} color={util > 1 ? 'var(--bad)' : util >= settings.budgetWarnThreshold ? 'var(--warn)' : 'var(--spending)'} label="Budget used" height="h-2" />
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span className="text-muted">{Math.round(util * 100)}% of {money(budget.amount, { decimals: 0 })}</span>
                    <span className={cn('font-medium', budget.amount - s.expenses < 0 ? 'text-bad-fg' : 'text-fg')}>
                      {budget.amount - s.expenses < 0 ? `${money(s.expenses - budget.amount, { decimals: 0 })} over` : `${money(budget.amount - s.expenses, { decimals: 0 })} left`}
                    </span>
                  </div>
                </div>
              ) : (
                <Link to="/spending/budgets" className="mt-4 block text-xs text-accent hover:underline">
                  Set a monthly budget →
                </Link>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
                <div>
                  <div className="text-muted">Income recorded</div>
                  <div className="mt-0.5 font-medium text-fg">{money(s.income, { decimals: 0 })}</div>
                </div>
                <div>
                  <div className="text-muted">Savings rate</div>
                  <div className="mt-0.5 font-medium text-fg">{s.savingsRate == null ? '—' : formatPct(s.savingsRate)}</div>
                </div>
              </div>
            </>
          )
        )}
      </CardBody>
    </Card>
  )
}

export function WealthWidget() {
  const { today, money } = useApp()
  const investments = useInvestments()
  const txns = useInvTxns()
  const vals = useValuations()
  const quick = useQuickAdd()
  const p = useMemo(() => (investments && txns && vals ? portfolioSummary(investments, txns, vals, today) : null), [investments, txns, vals, today])
  return (
    <Card className="h-full">
      <CardHeader
        title="Wealth"
        subtitle="Investments & net worth"
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-wealth-soft text-wealth"><TrendingUp className="h-4 w-4" /></span>}
        action={
          <ButtonLink to="/wealth" size="sm" variant="ghost">
            Open <ArrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
        }
      />
      <CardBody>
        {investments && investments.filter((i) => !i.archived).length === 0 ? (
          <EmptyState compact icon={<TrendingUp className="h-5 w-5" />} title="No investments yet" description="Add your Groww SIPs and HDFC FD to track contributions and value." action={<Button size="sm" onClick={() => quick('investment')}>Add investment</Button>} />
        ) : (
          p && (
            <>
              <div className="text-xs text-muted">Net worth (tracked)</div>
              <div className="mt-1 text-2xl font-semibold text-fg">{money(p.netWorth, { decimals: 0 })}</div>
              {p.unvaluedCount > 0 && <div className="mt-0.5 text-[11px] text-muted">Includes {money(p.unvaluedCost, { decimals: 0 })} at cost ({p.unvaluedCount} without a valuation)</div>}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
                <div>
                  <div className="text-muted">Invested capital</div>
                  <div className="mt-0.5 font-medium text-fg">{money(p.totalInvested, { decimals: 0 })}</div>
                </div>
                <div>
                  <div className="text-muted">Current value{p.hasEstimates ? '*' : ''}</div>
                  <div className="mt-0.5 font-medium text-fg">{p.valuedCount ? money(p.currentValue, { decimals: 0 }) : '—'}</div>
                </div>
                <div>
                  <div className="text-muted">Unrealised gain</div>
                  <div className={cn('mt-0.5 font-medium', p.valuedCount === 0 ? 'text-muted' : p.unrealized >= 0 ? 'text-good-fg' : 'text-bad-fg')}>{p.valuedCount ? money(p.unrealized, { decimals: 0, sign: true }) : '—'}</div>
                </div>
                <div>
                  <div className="text-muted">Return</div>
                  <div className="mt-0.5 font-medium text-fg">{p.returnPct == null ? '—' : formatPct(p.returnPct, { sign: true })}</div>
                </div>
              </div>
              {p.hasEstimates && <p className="mt-2 text-[11px] text-muted">* includes estimates</p>}
            </>
          )
        )}
      </CardBody>
    </Card>
  )
}

export function EventsWidget() {
  const { today, settings } = useApp()
  const events = useLiveQuery(() => db.events.toArray(), [])
  const quick = useQuickAdd()
  const tz = getAppTimezone()
  const upcoming = useMemo(() => (events ? buildInstances(events, addDays(today, 1), addDays(today, 30), tz, settings.eventCategories).slice(0, 5) : []), [events, today, tz, settings.eventCategories])
  return (
    <Card className="h-full">
      <CardHeader
        title="Upcoming"
        subtitle="Next 30 days"
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-events-soft text-events"><CalendarDays className="h-4 w-4" /></span>}
        action={
          <ButtonLink to="/events" size="sm" variant="ghost">
            Calendar <ArrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
        }
      />
      <CardBody>
        {upcoming.length === 0 ? (
          <EmptyState compact icon={<CalendarPlus className="h-5 w-5" />} title="No upcoming events" description="Add events or import from Apple Calendar (.ics)." action={<Button size="sm" onClick={() => quick('event')}>Add event</Button>} />
        ) : (
          <ul className="space-y-1">
            {upcoming.map((i) => (
              <li key={i.key}>
                <Link to={`/events?event=${i.event.id}&date=${i.startDate}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
                  <div className="flex w-10 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1">
                    <span className="text-[10px] text-muted uppercase">{new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(new Date(i.startDate + 'T00:00:00Z'))}</span>
                    <span className="text-sm font-semibold text-fg">{Number(i.startDate.slice(8))}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{i.event.title}</p>
                    <p className="text-[11px] text-muted">
                      {relativeDays(i.startDate, today)} · {i.allDay ? 'All day' : formatTime(i.start, tz)}
                    </p>
                  </div>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.color }} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

export function HeatmapWidget() {
  const { today, settings } = useApp()
  const stats = useLearningStats(today, settings.weekStartsOn)
  return (
    <Card>
      <CardHeader
        title="Learning activity"
        subtitle={stats ? `${formatHours(stats.totalMinutes)} logged · longest streak ${stats.streak.longest} days` : undefined}
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-learning-soft text-learning"><Flame className="h-4 w-4" /></span>}
      />
      <CardBody>{stats && <Heatmap sessions={stats.sessions} today={today} weekStartsOn={settings.weekStartsOn} />}</CardBody>
    </Card>
  )
}

export function TrackersWidget() {
  const { today, settings } = useApp()
  const trackers = useTrackers()
  const sessions = useSessions()
  const week = periodRange('week', today, settings.weekStartsOn)
  return (
    <Card>
      <CardHeader
        title="Your trackers"
        subtitle="Minutes logged this week"
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent"><Clock className="h-4 w-4" /></span>}
        action={
          <ButtonLink to="/trackers/new" size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />}>
            New tracker
          </ButtonLink>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {trackers?.map((t) => {
            const mins = sumMinutes(inRange((sessions ?? []).filter((s) => s.trackerId === t.id), week.from, week.to))
            return (
              <Link key={t.id} to={`/trackers/${t.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:border-line-strong hover:bg-surface-2/50">
                <TrackerIcon name={t.icon} color={t.color} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{t.name}</p>
                  <p className="text-xs text-muted">{formatMinutes(mins)} this week</p>
                </div>
              </Link>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}
