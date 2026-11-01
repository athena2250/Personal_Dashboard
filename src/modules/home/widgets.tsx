import { useMemo } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Plus } from 'lucide-react'
import { db } from '@/data/db'
import { useBudgets, useInvestments, useInvTxns, useTrackers, useTransactions, useValuations, useSessions } from '@/data/hooks'
import { Card, CardBody, CardHeader, ProgressBar, ProgressRing } from '@/components/ui/display'
import { ButtonLink } from '@/components/ui/Button'
import { Heatmap } from '@/components/charts/Heatmap'
import { TrackerIcon } from '@/components/ui/Icon'
import { useApp } from '@/app/AppContext'
import { useQuickAdd } from '@/app/QuickAdd'
import { useLearningStats } from '@/modules/learning/useLearningStats'
import { buildInstances } from '@/modules/events/calendarModel'
import { monthSummary, overallBudget } from '@/domain/spending'
import { portfolioSummary } from '@/domain/wealth'
import { addDays, formatHours, formatMinutes, monthKey, relativeDays } from '@/lib/dates'
import { formatTime, getAppTimezone } from '@/lib/tz'
import { formatPct } from '@/lib/money'
import { cn } from '@/lib/util'
import { inRange, sumMinutes, periodRange } from '@/domain/activity'

export function QuickActionsWidget() {
  const quick = useQuickAdd()
  const actions = [
    { kind: 'session' as const, label: 'Learning', color: 'var(--learning)' },
    { kind: 'expense' as const, label: 'Expense', color: 'var(--spending)' },
    { kind: 'invEntry' as const, label: 'Investment', color: 'var(--wealth)' },
    { kind: 'event' as const, label: 'Event', color: 'var(--events)' },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.kind}
          onClick={() => quick(a.kind)}
          className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
        >
          <Plus className="h-3 w-3" style={{ color: a.color }} />
          {a.label}
        </button>
      ))}
    </div>
  )
}

/** One-line empty state with an inline action. */
function EmptyLine({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return (
    <p className="py-2 text-sm text-muted">
      {text}{' '}
      <button className="text-accent hover:underline" onClick={onClick}>
        {action}
      </button>
    </p>
  )
}

/** Minimal header link to a module page. */
function OpenLink({ to, label }: { to: string; label: string }) {
  return (
    <ButtonLink to={to} size="icon-sm" variant="ghost" aria-label={label} title={label}>
      <ArrowRight className="h-3.5 w-3.5" />
    </ButtonLink>
  )
}

export function LearningWidget() {
  const { today, settings } = useApp()
  const stats = useLearningStats(today, settings.weekStartsOn)
  const quick = useQuickAdd()
  const t = stats
  return (
    <Card className="h-full">
      <CardHeader
        title="Learning"
        action={<OpenLink to="/learning" label="Open learning" />}
      />
      <CardBody>
        {!t ? null : t.sessions.length === 0 ? (
          <EmptyLine text="No sessions yet." action="Log one" onClick={() => quick('session')} />
        ) : (
          <div className="flex items-center gap-6">
            <ProgressRing value={t.weekGoalMinutes ? t.weekMinutes / t.weekGoalMinutes : 0} size={72} color="var(--learning)">
              <div>
                <div className="stat-figure text-sm text-fg">{formatHours(t.weekMinutes)}</div>
                <div className="tabular text-[10px] text-muted">{t.weekGoalMinutes ? `of ${formatHours(t.weekGoalMinutes)}` : 'this week'}</div>
              </div>
            </ProgressRing>
            <div className="flex gap-8">
              <div>
                <div className="stat-figure text-xl text-fg">{t.streak.current}</div>
                <div className="label-os mt-0.5 text-muted">day streak{t.streak.atRisk ? ' · log today' : ''}</div>
              </div>
              <div>
                <div className="stat-figure text-xl text-fg">{formatMinutes(t.todayMinutes)}</div>
                <div className="label-os mt-0.5 text-muted">today</div>
              </div>
            </div>
          </div>
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
  const budget = budgets ? overallBudget(budgets, month) : null
  const util = budget && s ? s.expenses / budget.amount : 0
  return (
    <Card className="h-full">
      <CardHeader
        title="Spending"
        action={<OpenLink to="/spending" label="Open spending" />}
      />
      <CardBody>
        {txs && txs.length === 0 ? (
          <EmptyLine text="No transactions yet." action="Add expense" onClick={() => quick('expense')} />
        ) : (
          s && (
            <>
              <div className="label-os text-muted">Spent this month</div>
              <div className="stat-figure mt-1.5 text-2xl text-fg">{money(s.expenses, { decimals: 0 })}</div>
              {budget ? (
                <div className="mt-4">
                  <ProgressBar value={util} color={util > 1 ? 'var(--bad)' : util >= settings.budgetWarnThreshold ? 'var(--warn)' : 'var(--spending)'} label="Budget used" height="h-1.5" />
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span className="tabular text-muted">{Math.round(util * 100)}% of {money(budget.amount, { decimals: 0 })}</span>
                    <span className={cn('tabular font-medium', budget.amount - s.expenses < 0 ? 'text-bad-fg' : 'text-fg')}>
                      {budget.amount - s.expenses < 0 ? `${money(s.expenses - budget.amount, { decimals: 0 })} over` : `${money(budget.amount - s.expenses, { decimals: 0 })} left`}
                    </span>
                  </div>
                </div>
              ) : (
                <Link to="/spending/budgets" className="mt-4 block text-xs text-accent hover:underline">
                  Set a monthly budget →
                </Link>
              )}
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
        action={<OpenLink to="/wealth" label="Open wealth" />}
      />
      <CardBody>
        {investments && investments.filter((i) => !i.archived).length === 0 ? (
          <EmptyLine text="No investments yet." action="Add investment" onClick={() => quick('investment')} />
        ) : (
          p && (
            <>
              <div className="label-os text-muted">Net worth</div>
              <div className="stat-figure mt-1.5 text-2xl text-fg">{money(p.netWorth, { decimals: 0 })}</div>
              {p.unvaluedCount > 0 && <div className="mt-0.5 text-[11px] text-muted">Includes {money(p.unvaluedCost, { decimals: 0 })} at cost ({p.unvaluedCount} without a valuation)</div>}
              <div className="mt-4 flex gap-8 text-xs">
                <div>
                  <div className="label-os text-muted">Invested</div>
                  <div className="tabular mt-1 font-medium text-fg">{money(p.totalInvested, { decimals: 0 })}</div>
                </div>
                <div>
                  <div className="label-os text-muted">Return{p.hasEstimates ? '*' : ''}</div>
                  <div className={cn('tabular mt-1 font-medium', p.returnPct == null ? 'text-muted' : p.unrealized >= 0 ? 'text-good-fg' : 'text-bad-fg')}>{p.returnPct == null ? '—' : formatPct(p.returnPct, { sign: true })}</div>
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
  const upcoming = useMemo(() => (events ? buildInstances(events, addDays(today, 1), addDays(today, 30), tz, settings.eventCategories).slice(0, 4) : []), [events, today, tz, settings.eventCategories])
  return (
    <Card className="h-full">
      <CardHeader
        title="Upcoming"
        action={<OpenLink to="/events" label="Open calendar" />}
      />
      <CardBody>
        {upcoming.length === 0 ? (
          <EmptyLine text="Nothing in the next 30 days." action="Add event" onClick={() => quick('event')} />
        ) : (
          <ul className="space-y-1">
            {upcoming.map((i) => (
              <li key={i.key}>
                <Link to={`/events?event=${i.event.id}&date=${i.startDate}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: i.color }} />
                  <p className="min-w-0 flex-1 truncate text-sm text-fg">{i.event.title}</p>
                  <span className="shrink-0 text-[11px] text-muted">
                    {relativeDays(i.startDate, today)}
                    {i.allDay ? '' : ` · ${formatTime(i.start, tz)}`}
                  </span>
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
        action={
          <ButtonLink to="/trackers/new" size="icon-sm" variant="ghost" aria-label="New tracker" title="New tracker">
            <Plus className="h-3.5 w-3.5" />
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
