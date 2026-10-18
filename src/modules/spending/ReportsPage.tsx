import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useBudgets, useCategories, useTransactions } from '@/data/hooks'
import { budgetFor, categoryBreakdown, changePct, monthSummary, txInMonth, yearReport, baseAmount } from '@/domain/spending'
import { toCsv } from '@/domain/csv'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, Delta, EmptyState, Loading, Segmented, StatCard } from '@/components/ui/display'
import { BarsChart, TrendChart } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useApp } from '@/app/AppContext'
import { addMonthKey, eachDay, endOfMonth, formatMonth, monthKey, startOfMonth } from '@/lib/dates'
import { formatPct } from '@/lib/money'
import { downloadFile } from '@/lib/util'

export function ReportsPage() {
  const { today, money } = useApp()
  const txs = useTransactions()
  const categories = useCategories()
  const budgets = useBudgets()
  const t = useChartTheme()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(monthKey(today))
  const [year, setYear] = useState(Number(today.slice(0, 4)))

  const monthly = useMemo(() => {
    if (!txs) return null
    const list = txInMonth(txs, month)
    const s = monthSummary(txs, month)
    const prevList = txInMonth(txs, addMonthKey(month, -1))
    const prevBy = new Map(categoryBreakdown(prevList).map((c) => [c.category, c.amount]))
    const cats = categoryBreakdown(list).map((c) => ({ ...c, prev: prevBy.get(c.category) ?? 0 }))
    const merchants = new Map<string, number>()
    for (const x of list) if (x.type === 'expense') merchants.set(x.merchant, (merchants.get(x.merchant) ?? 0) + baseAmount(x))
    const top = [...merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    let cum = 0
    const days = eachDay(startOfMonth(month), month === monthKey(today) ? today : endOfMonth(month)).map((d) => {
      const amt = list.filter((x) => x.type === 'expense' && x.date === d).reduce((s2, x) => s2 + baseAmount(x), 0)
      cum += amt
      return { day: String(Number(d.slice(8))), Spent: Math.round(amt), Cumulative: Math.round(cum) }
    })
    return { s, prev: monthSummary(txs, addMonthKey(month, -1)), cats, top, days }
  }, [txs, month, today])

  const yearly = useMemo(() => (txs ? yearReport(txs, year, today) : null), [txs, year, today])
  const years = useMemo(() => [...new Set([Number(today.slice(0, 4)), ...(txs ?? []).map((x) => Number(x.date.slice(0, 4)))])].sort((a, b) => b - a), [txs, today])

  if (!txs || !categories || !budgets || !monthly || !yearly) return <Loading />
  if (!txs.length) return <Card><EmptyState title="No data for reports yet" description="Reports are generated from your recorded transactions." /></Card>
  const colorOf = (name: string) => categories.find((c) => c.name === name)?.color ?? t.muted

  const exportMonth = () => {
    const rows = monthly.cats.map((c) => ({ category: c.category, spent: c.amount, share: (c.share * 100).toFixed(1) + '%', transactions: c.count, previous_month: c.prev, budget: budgetFor(budgets, c.category, month)?.amount ?? '' }))
    downloadFile(`spending-report-${month}.csv`, toCsv([...rows, { category: 'TOTAL EXPENSES', spent: monthly.s.expenses }, { category: 'TOTAL INCOME', spent: monthly.s.income }, { category: 'NET', spent: monthly.s.net }]), 'text/csv')
  }
  const exportYear = () => {
    const rows = yearly.months.map((m) => ({ month: m.month, income: m.income, expenses: m.expenses, net: m.net, savings_rate: m.savingsRate == null ? '' : (m.savingsRate * 100).toFixed(1) + '%' }))
    downloadFile(`spending-report-${year}.csv`, toCsv([...rows, { month: 'TOTAL', income: yearly.income, expenses: yearly.expenses, net: yearly.net }]), 'text/csv')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'month', label: 'Monthly report' }, { value: 'year', label: 'Yearly report' }]} />
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Previous" onClick={() => (mode === 'month' ? setMonth(addMonthKey(month, -1)) : setYear(year - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[130px] text-center text-sm font-semibold text-fg">{mode === 'month' ? formatMonth(month) : year}</span>
          <Button size="icon-sm" variant="ghost" aria-label="Next" onClick={() => (mode === 'month' ? setMonth(addMonthKey(month, 1)) : setYear(year + 1))} disabled={mode === 'month' ? month >= monthKey(today) : year >= Number(today.slice(0, 4))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={mode === 'month' ? exportMonth : exportYear}>
            Export
          </Button>
        </div>
      </div>

      {mode === 'month' ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Expenses" value={money(monthly.s.expenses, { decimals: 0 })} sub={<Delta value={changePct(monthly.s.expenses, monthly.prev.expenses)} invert suffix="vs prev." />} tone="spending" />
            <StatCard label="Income" value={money(monthly.s.income, { decimals: 0 })} tone="good" />
            <StatCard label="Net" value={money(monthly.s.net, { decimals: 0, sign: true })} />
            <StatCard label="Savings rate" value={monthly.s.savingsRate == null ? '—' : formatPct(monthly.s.savingsRate)} tone="wealth" />
          </div>
          <Card>
            <CardHeader title="Daily spending" subtitle="Bars: per day" />
            <CardBody>
              <BarsChart height={200} data={monthly.days} xKey="day" series={[{ key: 'Spent', label: 'Spent', color: t.spending }]} formatY={(v) => money(v, { compact: true })} yWidth={52} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Cumulative spending" />
            <CardBody>
              <TrendChart height={180} data={monthly.days} xKey="day" series={[{ key: 'Cumulative', label: 'Cumulative', color: t.spending }]} formatY={(v) => money(v, { compact: true })} yWidth={52} />
            </CardBody>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="By category" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-5 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 text-right font-medium">Spent</th>
                      <th className="px-3 py-2 text-right font-medium">Share</th>
                      <th className="px-3 py-2 text-right font-medium">Budget</th>
                      <th className="px-5 py-2 text-right font-medium">vs prev. month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {monthly.cats.map((c) => {
                      const b = budgetFor(budgets, c.category, month)
                      return (
                        <tr key={c.category}>
                          <td className="px-5 py-2.5">
                            <span className="flex items-center gap-2 text-fg">
                              <span className="h-2 w-2 rounded-full" style={{ background: colorOf(c.category) }} />
                              {c.category}
                            </span>
                          </td>
                          <td className="tabular px-3 py-2.5 text-right text-fg">{money(c.amount, { decimals: 0 })}</td>
                          <td className="tabular px-3 py-2.5 text-right text-fg-2">{formatPct(c.share)}</td>
                          <td className="tabular px-3 py-2.5 text-right text-fg-2">{b ? money(b.amount, { decimals: 0 }) : '—'}</td>
                          <td className="px-5 py-2.5 text-right">
                            <Delta value={changePct(c.amount, c.prev)} invert />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <CardHeader title="Top merchants" />
              <CardBody>
                <ul className="space-y-2">
                  {monthly.top.map(([m, a]) => (
                    <li key={m} className="flex justify-between gap-2 text-sm">
                      <span className="truncate text-fg-2">{m}</span>
                      <span className="tabular text-fg">{money(a, { decimals: 0 })}</span>
                    </li>
                  ))}
                  {!monthly.top.length && <li className="text-xs text-muted">No expenses.</li>}
                </ul>
              </CardBody>
            </Card>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={`Expenses ${year}`} value={money(yearly.expenses, { decimals: 0 })} tone="spending" />
            <StatCard label="Income" value={money(yearly.income, { decimals: 0 })} tone="good" />
            <StatCard label="Avg monthly expense" value={money(yearly.avgMonthlyExpense, { decimals: 0 })} sub="Months with activity" />
            <StatCard label="Savings rate" value={yearly.savingsRate == null ? '—' : formatPct(yearly.savingsRate)} tone="wealth" />
          </div>
          <Card>
            <CardHeader title="Month by month" />
            <CardBody>
              <BarsChart
                height={240}
                showLegend
                data={yearly.months.map((m) => ({ month: formatMonth(m.month, 'short'), Expenses: m.expenses, Income: m.income }))}
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
          <Card>
            <CardHeader title="Categories for the year" />
            <CardBody>
              <BarsChart layout="vertical" height={Math.max(160, Math.min(12, yearly.categories.length) * 30)} data={yearly.categories.slice(0, 12).map((c) => ({ cat: c.category, Spent: c.amount }))} xKey="cat" series={[{ key: 'Spent', label: 'Spent', color: t.spending }]} colorByIndex={yearly.categories.slice(0, 12).map((c) => colorOf(c.category))} formatY={(v) => money(v, { compact: true })} yWidth={120} />
            </CardBody>
          </Card>
          <p className="text-xs text-muted">Years with data: {years.join(', ')}</p>
        </>
      )}
    </div>
  )
}
