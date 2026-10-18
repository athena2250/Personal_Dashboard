import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, CircleAlert, PiggyBank, Receipt, Upload, Wallet } from 'lucide-react'
import { useBudgets, useCategories, useRecurring, useTransactions } from '@/data/hooks'
import { TOTAL_BUDGET } from '@/data/models'
import { budgetStatuses, categoryBreakdown, changePct, monthSummary, monthlyTrend, overallBudget, txInMonth, upcomingRecurring, budgetPace } from '@/domain/spending'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, Card, CardBody, CardHeader, Delta, EmptyState, Loading, ProgressBar, StatCard } from '@/components/ui/display'
import { BarsChart, DonutWithLegend } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useApp } from '@/app/AppContext'
import { useQuickAdd } from '@/app/QuickAdd'
import { addMonthKey, formatDate, formatMonth, monthKey, relativeDays } from '@/lib/dates'
import { formatPct } from '@/lib/money'
import { cn } from '@/lib/util'
import { ImportTransactionsModal } from './ImportTransactions'

export function SpendingOverview() {
  const { today, money, settings } = useApp()
  const txs = useTransactions()
  const budgets = useBudgets()
  const categories = useCategories()
  const recurring = useRecurring()
  const quick = useQuickAdd()
  const t = useChartTheme()
  const [month, setMonth] = useState(monthKey(today))
  const [importing, setImporting] = useState(false)
  const isCurrent = month === monthKey(today)

  const data = useMemo(() => {
    if (!txs || !budgets) return null
    const s = monthSummary(txs, month)
    const prev = monthSummary(txs, addMonthKey(month, -1))
    const breakdown = categoryBreakdown(txInMonth(txs, month))
    const trend = monthlyTrend(txs, month, 6)
    const statuses = budgetStatuses(txs, budgets, month, settings.budgetWarnThreshold)
    return { s, prev, breakdown, trend, statuses, budget: overallBudget(budgets, month) }
  }, [txs, budgets, month, settings.budgetWarnThreshold])

  if (!data || !categories || !recurring) return <Loading />
  if (txs!.length === 0)
    return (
      <Card>
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title="No transactions yet"
          description="Add expenses and income as they happen, or import a CSV exported from your bank or another app. Totals, budgets and reports appear once you have data."
          action={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => quick('expense')}>
                Add expense
              </Button>
              <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>
                Import CSV
              </Button>
            </div>
          }
        />
        <ImportTransactionsModal open={importing} onClose={() => setImporting(false)} />
      </Card>
    )

  const { s, prev, breakdown, trend, statuses, budget } = data
  const color = (name: string, i: number) => categories.find((c) => c.name === name)?.color ?? t.series[i % 8]
  const top = breakdown.slice(0, 6)
  const rest = breakdown.slice(6).reduce((x, b) => x + b.amount, 0)
  const donut = [...top.map((b, i) => ({ label: b.category, value: b.amount, color: color(b.category, i) })), ...(rest > 0 ? [{ label: 'Other', value: rest, color: t.muted }] : [])]
  const upcoming = upcomingRecurring(recurring, today, 30).filter((u) => u.rule.type === 'expense').slice(0, 6)
  const alerts = statuses.filter((x) => x.state !== 'ok')
  const remaining = budget ? budget.amount - s.expenses : null
  const pace = budget && isCurrent ? budgetPace(budget.amount, today) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => setMonth(addMonthKey(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[150px] text-center text-sm font-semibold text-fg">{formatMonth(month)}</h2>
          <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => setMonth(addMonthKey(month, 1))} disabled={isCurrent}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" variant="ghost" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => setImporting(true)}>
          Import CSV
        </Button>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2" role="alert">
          {alerts.slice(0, 3).map((a) => (
            <div key={a.category} className={cn('flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm', a.state === 'over' ? 'border-bad/30 bg-bad/10' : 'border-warn/30 bg-warn/10')}>
              {a.state === 'over' ? <CircleAlert className="h-4 w-4 shrink-0 text-bad-fg" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />}
              <span className="text-fg">
                <strong>{a.category === TOTAL_BUDGET ? 'Overall budget' : a.category}</strong>: {a.state === 'over' ? `over budget by ${money(-a.remaining, { decimals: 0 })}` : `${Math.round(a.utilization * 100)}% used — ${money(a.remaining, { decimals: 0 })} left`}
              </span>
              <Link to="/spending/budgets" className="ml-auto text-xs font-medium text-fg-2 hover:text-fg">
                Budgets →
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Spent this month" value={money(s.expenses, { decimals: 0 })} sub={<Delta value={changePct(s.expenses, prev.expenses)} invert suffix={`vs ${formatMonth(addMonthKey(month, -1), 'short')}`} />} icon={<ArrowDownRight className="h-4 w-4" />} tone="spending" />
        <StatCard
          label="Budget remaining"
          value={remaining == null ? '—' : <span className={remaining < 0 ? 'text-bad-fg' : ''}>{money(remaining, { decimals: 0 })}</span>}
          sub={budget ? `of ${money(budget.amount, { decimals: 0 })}${budget.explicit ? '' : ' (sum of categories)'}` : <Link to="/spending/budgets" className="text-accent hover:underline">Set a budget</Link>}
          icon={<Wallet className="h-4 w-4" />}
          tone={remaining != null && remaining < 0 ? 'bad' : 'accent'}
        />
        <StatCard label="Income recorded" value={money(s.income, { decimals: 0 })} sub={`Net ${money(s.net, { decimals: 0, sign: true })}`} icon={<ArrowUpRight className="h-4 w-4" />} tone="good" />
        <StatCard label="Savings rate" value={s.savingsRate == null ? '—' : formatPct(s.savingsRate)} sub={s.savingsRate == null ? 'Record income to calculate' : '(income − expenses) ÷ income'} icon={<PiggyBank className="h-4 w-4" />} tone="wealth" />
      </div>

      {budget && (
        <Card>
          <CardBody className="pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-fg">Monthly budget</span>
              <span className="text-xs text-muted">
                {Math.round((s.expenses / budget.amount) * 100)}% used{pace != null ? ` · on an even pace you'd have spent ${money(pace, { decimals: 0 })} by today` : ''}
              </span>
            </div>
            <div className="relative">
              <ProgressBar value={s.expenses / budget.amount} height="h-3" color={s.expenses > budget.amount ? 'var(--bad)' : s.expenses / budget.amount >= settings.budgetWarnThreshold ? 'var(--warn)' : 'var(--spending)'} label="Monthly budget used" />
              {pace != null && <div className="absolute -top-1 h-5 w-0.5 rounded bg-fg/60" style={{ left: `${Math.min(100, (pace / budget.amount) * 100)}%` }} title="Even-pace marker" aria-hidden />}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Monthly trend" subtitle="Income vs expenses, last 6 months" />
          <CardBody>
            <BarsChart
              height={240}
              showLegend
              data={trend.map((m) => ({ month: formatMonth(m.month, 'short'), Expenses: m.expenses, Income: m.income }))}
              xKey="month"
              series={[
                { key: 'Expenses', label: 'Expenses', color: t.spending },
                { key: 'Income', label: 'Income', color: t.series[2] },
              ]}
              formatY={(v) => money(v, { compact: true })}
              yWidth={56}
            />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Largest categories" subtitle={formatMonth(month)} />
          <CardBody>{donut.length ? <DonutWithLegend size={140} data={donut} format={(v) => money(v, { decimals: 0 })} /> : <p className="py-12 text-center text-sm text-muted">No expenses this month.</p>}</CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Budget utilisation" action={<ButtonLink to="/spending/budgets" size="sm" variant="ghost">Manage</ButtonLink>} />
          <CardBody>
            {statuses.filter((x) => x.category !== TOTAL_BUDGET).length === 0 ? (
              <EmptyState compact title="No category budgets" description="Set budgets per category to track utilisation and get warnings." />
            ) : (
              <ul className="space-y-3">
                {statuses
                  .filter((x) => x.category !== TOTAL_BUDGET)
                  .slice(0, 6)
                  .map((b) => (
                    <li key={b.category}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-fg">
                          {b.category}
                          {b.state === 'over' && <Badge tone="bad"><CircleAlert className="h-3 w-3" /> Over</Badge>}
                          {b.state === 'warning' && <Badge tone="warn"><AlertTriangle className="h-3 w-3" /> Near limit</Badge>}
                        </span>
                        <span className="tabular text-xs text-muted">
                          {money(b.spent, { decimals: 0 })} / {money(b.budget, { decimals: 0 })}
                        </span>
                      </div>
                      <ProgressBar value={b.utilization} color={b.state === 'over' ? 'var(--bad)' : b.state === 'warning' ? 'var(--warn)' : 'var(--spending)'} label={`${b.category} budget`} />
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Upcoming recurring expenses" subtitle="Next 30 days" icon={<CalendarClock className="h-4 w-4 text-muted" />} action={<ButtonLink to="/spending/recurring" size="sm" variant="ghost">Manage</ButtonLink>} />
          <CardBody>
            {upcoming.length === 0 ? (
              <EmptyState compact title="Nothing scheduled" description="Add rent, subscriptions and bills as recurring transactions." />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((u) => (
                  <li key={u.rule.id + u.date} className="flex items-center justify-between py-2.5 text-sm">
                    <span>
                      <span className="text-fg">{u.rule.merchant}</span>
                      <span className="block text-xs text-muted">
                        {u.rule.category} · {relativeDays(u.date, today)} ({formatDate(u.date, 'short')})
                      </span>
                    </span>
                    <span className="tabular font-medium text-fg">{money(u.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <ImportTransactionsModal open={importing} onClose={() => setImporting(false)} />
    </div>
  )
}
