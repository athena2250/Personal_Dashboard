import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Download } from 'lucide-react'
import { contributionsByMonth, flowsUpTo, holdingValueAt } from '@/domain/wealth'
import { toCsv } from '@/domain/csv'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState, Loading, Segmented, StatCard } from '@/components/ui/display'
import { Select } from '@/components/ui/forms'
import { BarsChart } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useApp } from '@/app/AppContext'
import { addMonthKey, endOfMonth, formatDate, formatMonth, minDate, monthKey } from '@/lib/dates'
import { downloadFile } from '@/lib/util'
import { usePortfolio } from './usePortfolio'

export function ContributionsPage() {
  const { today, money } = useApp()
  const { investments, txns, vals } = usePortfolio(today)
  const t = useChartTheme()
  const [view, setView] = useState<'monthly' | 'yearly'>('monthly')
  const [inv, setInv] = useState('')

  const scoped = useMemo(() => {
    if (!investments || !txns) return []
    const assetIds = new Set(investments.filter((i) => !i.isLiability).map((i) => i.id))
    return txns.filter((x) => assetIds.has(x.investmentId) && (!inv || x.investmentId === inv))
  }, [investments, txns, inv])

  const monthly = useMemo(() => {
    if (!scoped.length) return []
    const first = monthKey([...scoped].sort((a, b) => a.date.localeCompare(b.date))[0].date)
    const from = first < addMonthKey(monthKey(today), -23) ? addMonthKey(monthKey(today), -23) : first
    return contributionsByMonth(scoped, from, monthKey(today))
  }, [scoped, today])

  /** Year summaries: contributions, withdrawals, and year-end value (valuations where available). */
  const yearly = useMemo(() => {
    if (!investments || !txns || !vals || !scoped.length) return []
    const years = [...new Set(scoped.map((x) => Number(x.date.slice(0, 4))))].sort()
    const active = investments.filter((i) => !i.isLiability && (!inv || i.id === inv))
    return years.map((y) => {
      const yt = scoped.filter((x) => x.date.startsWith(String(y)))
      const asOf = minDate(endOfMonth(`${y}-12`), today)
      let value = 0
      let valued = 0
      let invested = 0
      for (const i of active) {
        const it = txns.filter((x) => x.investmentId === i.id)
        invested += flowsUpTo(it, asOf).netInvested
        const hv = holdingValueAt(i, it, vals.filter((v) => v.investmentId === i.id), asOf)
        if (hv.value != null) {
          value += hv.value
          valued++
        }
      }
      return {
        year: y,
        contributions: yt.filter((x) => x.type === 'contribution').reduce((s, x) => s + x.amount, 0),
        withdrawals: yt.filter((x) => x.type === 'withdrawal').reduce((s, x) => s + x.amount, 0),
        income: yt.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0),
        investedEnd: invested,
        valueEnd: valued ? value : null,
        valued,
        total: active.length,
      }
    })
  }, [investments, txns, vals, scoped, inv, today])

  if (!investments || !txns || !vals) return <Loading />
  if (!scoped.length && !inv) return <Card><EmptyState title="No contributions recorded" description="Record SIP installments or contributions on a holding, or import them from CSV." /></Card>

  const thisYear = yearly.find((y) => y.year === Number(today.slice(0, 4)))
  const last12 = monthly.slice(-12).reduce((s, m) => s + m.net, 0)
  const exportCsv = () => {
    const name = new Map(investments.map((i) => [i.id, i.name]))
    downloadFile(`investment-entries-${today}.csv`, toCsv([...scoped].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ date: x.date, investment: name.get(x.investmentId), type: x.type, amount: x.amount, units: x.units ?? '', nav: x.nav ?? '', source: x.source, notes: x.notes ?? '' }))), 'text/csv')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
        <div className="flex gap-2">
          <Select value={inv} onChange={(e) => setInv(e.target.value)} className="w-auto" aria-label="Investment">
            <option value="">All investments</option>
            {investments.filter((i) => !i.isLiability).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv} disabled={!scoped.length}>
            Export
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Net contributed, last 12 months" value={money(last12, { decimals: 0 })} tone="wealth" />
        <StatCard label={`Contributed in ${today.slice(0, 4)}`} value={money(thisYear?.contributions ?? 0, { decimals: 0 })} />
        <StatCard label="Average per month (12m)" value={money(last12 / Math.max(1, Math.min(12, monthly.length)), { decimals: 0 })} />
      </div>
      {view === 'monthly' ? (
        <>
          <Card>
            <CardHeader title="Contributions over time" subtitle="Up to the last 24 months" />
            <CardBody>
              <BarsChart height={240} showLegend data={monthly.map((m) => ({ month: formatMonth(m.month, 'short'), Contributions: m.contributions, Withdrawals: m.withdrawals }))} xKey="month" series={[{ key: 'Contributions', label: 'Contributions', color: t.wealth }, { key: 'Withdrawals', label: 'Withdrawals', color: t.series[1] }]} formatY={(v) => money(v, { compact: true })} yWidth={56} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent entries" />
            <ul className="divide-y divide-line">
              {[...scoped]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 30)
                .map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <Link to={`/wealth/holdings/${x.investmentId}`} className="text-fg hover:underline">
                        {investments.find((i) => i.id === x.investmentId)?.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {formatDate(x.date)} · {x.type}
                      </span>
                    </span>
                    <span className="tabular text-fg">{money(x.amount)}</span>
                  </li>
                ))}
            </ul>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader title="Yearly portfolio summary" subtitle="Year-end value uses valuations (or FD estimates) only where available" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium">Year</th>
                  <th className="px-3 py-2.5 text-right font-medium">Contributed</th>
                  <th className="px-3 py-2.5 text-right font-medium">Withdrawn</th>
                  <th className="px-3 py-2.5 text-right font-medium">Income paid out</th>
                  <th className="px-3 py-2.5 text-right font-medium">Invested (year-end)</th>
                  <th className="px-5 py-2.5 text-right font-medium">Value (year-end)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {yearly.map((y) => (
                  <tr key={y.year}>
                    <td className="px-5 py-2.5 font-medium text-fg">{y.year}</td>
                    <td className="tabular px-3 py-2.5 text-right">{money(y.contributions, { decimals: 0 })}</td>
                    <td className="tabular px-3 py-2.5 text-right">{money(y.withdrawals, { decimals: 0 })}</td>
                    <td className="tabular px-3 py-2.5 text-right">{money(y.income, { decimals: 0 })}</td>
                    <td className="tabular px-3 py-2.5 text-right">{money(y.investedEnd, { decimals: 0 })}</td>
                    <td className="tabular px-5 py-2.5 text-right">
                      {y.valueEnd == null ? '—' : money(y.valueEnd, { decimals: 0 })}
                      {y.valueEnd != null && y.valued < y.total && <div className="text-[11px] text-muted">{y.valued}/{y.total} holdings valued</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
