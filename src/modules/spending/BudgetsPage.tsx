import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Trash2 } from 'lucide-react'
import { TOTAL_BUDGET, type Budget } from '@/data/models'
import { useBudgets, useCategories, useTransactions } from '@/data/hooks'
import { deleteBudget, setBudget } from '@/data/repos/spending'
import { budgetFor, budgetState, categoryBreakdown, txInMonth } from '@/domain/spending'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardBody, CardHeader, Loading, ProgressBar } from '@/components/ui/display'
import { Input } from '@/components/ui/forms'
import { Modal } from '@/components/ui/Modal'
import { BarsChart } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { addMonthKey, formatMonth, monthKey } from '@/lib/dates'

function StateBadge({ state }: { state: 'ok' | 'warning' | 'over' }) {
  if (state === 'over')
    return (
      <Badge tone="bad">
        <CircleAlert className="h-3 w-3" /> Over budget
      </Badge>
    )
  if (state === 'warning')
    return (
      <Badge tone="warn">
        <AlertTriangle className="h-3 w-3" /> Near limit
      </Badge>
    )
  return (
    <Badge tone="good">
      <CircleCheck className="h-3 w-3" /> On track
    </Badge>
  )
}

export function BudgetsPage() {
  const { today, money, settings } = useApp()
  const txs = useTransactions()
  const budgets = useBudgets()
  const categories = useCategories()
  const t = useChartTheme()
  const [month, setMonth] = useState(monthKey(today))
  const [editing, setEditing] = useState<string | null>(null)

  const spentBy = useMemo(() => new Map(categoryBreakdown(txInMonth(txs ?? [], month)).map((c) => [c.category, c.amount])), [txs, month])
  if (!txs || !budgets || !categories) return <Loading />
  const totalSpent = [...spentBy.values()].reduce((s, x) => s + x, 0)
  const expenseCats = categories.filter((c) => c.type === 'expense' && !c.archived)
  const total = budgetFor(budgets, TOTAL_BUDGET, month)
  const rows = expenseCats.map((c) => {
    const b = budgetFor(budgets, c.name, month)
    const spent = spentBy.get(c.name) ?? 0
    return { cat: c, budget: b, spent, state: b ? budgetState(spent, b.amount, settings.budgetWarnThreshold) : null }
  })
  const withBudget = rows.filter((r) => r.budget)
  const sumCats = withBudget.reduce((s, r) => s + r.budget!.amount, 0)
  const chartData = withBudget.map((r) => ({ cat: r.cat.name.length > 14 ? r.cat.name.slice(0, 13) + '…' : r.cat.name, Planned: r.budget!.amount, Actual: r.spent }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => setMonth(addMonthKey(month, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-[150px] text-center text-sm font-semibold text-fg">{formatMonth(month)}</h2>
        <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => setMonth(addMonthKey(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-3 text-xs text-muted">Warnings at {Math.round(settings.budgetWarnThreshold * 100)}% (change in Settings)</span>
      </div>

      <Card>
        <CardHeader title="Overall monthly budget" subtitle={total ? (total.month === '*' ? 'Applies every month' : `Override for ${formatMonth(month)}`) : `Not set — category budgets add up to ${money(sumCats, { decimals: 0 })}`} action={<Button size="sm" onClick={() => setEditing(TOTAL_BUDGET)}>{total ? 'Edit' : 'Set budget'}</Button>} />
        <CardBody>
          {total ? (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-fg">
                  {money(totalSpent, { decimals: 0 })} <span className="text-muted">of {money(total.amount, { decimals: 0 })}</span>
                </span>
                <StateBadge state={budgetState(totalSpent, total.amount, settings.budgetWarnThreshold)} />
              </div>
              <ProgressBar value={totalSpent / total.amount} height="h-3" color={totalSpent > total.amount ? 'var(--bad)' : totalSpent / total.amount >= settings.budgetWarnThreshold ? 'var(--warn)' : 'var(--spending)'} label="Overall budget used" />
              <p className="mt-2 text-xs text-muted">{total.amount - totalSpent >= 0 ? `${money(total.amount - totalSpent, { decimals: 0 })} remaining` : `${money(totalSpent - total.amount, { decimals: 0 })} over`}</p>
              {sumCats > total.amount && <p className="mt-1 text-xs text-warn">Category budgets ({money(sumCats, { decimals: 0 })}) exceed the overall budget.</p>}
            </>
          ) : (
            <p className="text-sm text-muted">Set an overall budget, or just set category budgets below.</p>
          )}
        </CardBody>
      </Card>

      {chartData.length > 0 && (
        <Card>
          <CardHeader title="Planned vs actual" subtitle={formatMonth(month)} />
          <CardBody>
            <BarsChart
              height={Math.max(160, chartData.length * 44)}
              layout="vertical"
              showLegend
              data={chartData}
              xKey="cat"
              series={[
                { key: 'Planned', label: 'Planned', color: t.muted },
                { key: 'Actual', label: 'Actual', color: t.spending },
              ]}
              formatY={(v) => money(v, { compact: true })}
              yWidth={110}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Category budgets" subtitle="Click a category to set or change its budget" />
        <ul className="divide-y divide-line">
          {rows.map(({ cat, budget, spent, state }) => (
            <li key={cat.id}>
              <button className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-surface-2/40" onClick={() => setEditing(cat.name)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
                <span className="min-w-[140px] flex-1 text-sm text-fg">
                  {cat.name}
                  {budget && budget.month !== '*' && <span className="ml-2 text-[11px] text-muted">(this month only)</span>}
                </span>
                {budget ? (
                  <>
                    <div className="w-full sm:w-48">
                      <ProgressBar value={budget.amount ? spent / budget.amount : 1} color={state === 'over' ? 'var(--bad)' : state === 'warning' ? 'var(--warn)' : 'var(--spending)'} label={`${cat.name} budget used`} />
                    </div>
                    <span className="tabular w-40 text-right text-xs text-fg-2">
                      {money(spent, { decimals: 0 })} / {money(budget.amount, { decimals: 0 })}
                    </span>
                    {state && <StateBadge state={state} />}
                  </>
                ) : (
                  <span className="text-xs text-muted">{spent ? `${money(spent, { decimals: 0 })} spent · no budget` : 'No budget'}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <BudgetModal category={editing} month={month} budgets={budgets} onClose={() => setEditing(null)} />
    </div>
  )
}

function BudgetModal({ category, month, budgets, onClose }: { category: string | null; month: string; budgets: Budget[]; onClose: () => void }) {
  return (
    <Modal open={!!category} onClose={onClose} title={category === TOTAL_BUDGET ? 'Overall monthly budget' : `Budget: ${category}`} size="sm">
      {category && <BudgetForm category={category} month={month} budgets={budgets} onDone={onClose} />}
    </Modal>
  )
}

function BudgetForm({ category, month, budgets, onDone }: { category: string; month: string; budgets: Budget[]; onDone: () => void }) {
  const toast = useToast()
  const def = budgets.find((b) => b.category === category && b.month === '*')
  const ovr = budgets.find((b) => b.category === category && b.month === month)
  const [every, setEvery] = useState(def ? String(def.amount) : '')
  const [only, setOnly] = useState(ovr ? String(ovr.amount) : '')
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (every.trim() !== '') await setBudget(category, '*', Number(every))
      else if (def) await deleteBudget(def.id)
      if (only.trim() !== '') await setBudget(category, month, Number(only))
      else if (ovr) await deleteBudget(ovr.id)
      toast.success('Budget saved')
      onDone()
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block text-xs font-medium text-fg-2">
        Every month
        <Input className="mt-1.5" type="number" min="0" step="1" value={every} onChange={(e) => setEvery(e.target.value)} placeholder="Leave empty for none" autoFocus />
      </label>
      <label className="block text-xs font-medium text-fg-2">
        Override for {formatMonth(month)} only
        <Input className="mt-1.5" type="number" min="0" step="1" value={only} onChange={(e) => setOnly(e.target.value)} placeholder="Optional" />
      </label>
      <div className="flex items-center justify-between">
        {(def || ovr) && (
          <Button variant="ghost" className="text-bad-fg" icon={<Trash2 className="h-4 w-4" />} onClick={() => { setEvery(''); setOnly('') }}>
            Clear both
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
