import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertCircle, CalendarClock, Info, Landmark, PiggyBank, Plus, Scale, TrendingUp } from 'lucide-react'
import { allocationByType, contributionsByMonth, netWorthSeries, VALUE_SOURCE_LABELS } from '@/domain/wealth'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, Card, CardBody, CardHeader, EmptyState, Loading, Segmented, StatCard } from '@/components/ui/display'
import { BarsChart, DonutWithLegend, TrendChart } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useApp } from '@/app/AppContext'
import { useQuickAdd } from '@/app/QuickAdd'
import { addMonthKey, formatDate, formatMonth, monthKey, relativeDays, diffDays } from '@/lib/dates'
import { formatPct } from '@/lib/money'
import { cn } from '@/lib/util'
import { usePortfolio } from './usePortfolio'

export function WealthOverview() {
  const { today, money, settings } = useApp()
  const { investments, txns, vals, summary: p } = usePortfolio(today)
  const quick = useQuickAdd()
  const t = useChartTheme()
  const [range, setRange] = useState<'12' | '24' | 'all'>('12')

  const series = useMemo(() => {
    if (!investments || !txns || !vals) return null
    const firstDate = [...txns.map((x) => x.date), ...vals.map((v) => v.date)].sort()[0]
    const end = monthKey(today)
    const from = range === 'all' && firstDate ? monthKey(firstDate) : addMonthKey(end, -(Number(range === 'all' ? 12 : range) - 1))
    return {
      nw: netWorthSeries(investments, txns, vals, from, end, today),
      contrib: contributionsByMonth(txns.filter((x) => !investments.find((i) => i.id === x.investmentId)?.isLiability), from, end),
    }
  }, [investments, txns, vals, range, today])

  if (!p || !series || !investments) return <Loading />
  if (investments.filter((i) => !i.archived).length === 0)
    return (
      <Card>
        <EmptyState
          icon={<TrendingUp className="h-5 w-5" />}
          title="Add your first investment"
          description="Start with your Groww SIPs and HDFC fixed deposit. Record contributions as they happen and update current values from the Groww app or bank statements."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/wealth/holdings?add=sip" variant="primary">
                Add SIP (Groww)
              </ButtonLink>
              <ButtonLink to="/wealth/holdings?add=fd">Add fixed deposit (HDFC)</ButtonLink>
              <ButtonLink to="/wealth/import">Import CSV</ButtonLink>
            </div>
          }
        />
      </Card>
    )

  const alloc = allocationByType(p)
  const sipsDue = p.holdings.filter((h) => h.investment.sip?.active).map((h) => ({ h, next: h.investment.sip!.nextDate })).sort((a, b) => a.next.localeCompare(b.next))
  const maturing = p.holdings.filter((h) => h.maturity && h.maturity.date >= today).sort((a, b) => a.maturity!.date.localeCompare(b.maturity!.date))
  const stale = p.holdings.filter((h) => h.valuationDate && diffDays(today, h.valuationDate) > 45 && !h.investment.isLiability)
  const thisMonth = series.contrib[series.contrib.length - 1]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invested capital" value={money(p.totalInvested, { decimals: 0 })} sub="Contributions − withdrawals" icon={<PiggyBank className="h-4 w-4" />} tone="wealth" />
        <StatCard
          label={`Current value${p.hasEstimates ? ' *' : ''}`}
          value={p.valuedCount ? money(p.currentValue, { decimals: 0 }) : '—'}
          sub={p.unvaluedCount ? `${p.valuedCount} of ${p.valuedCount + p.unvaluedCount} holdings valued` : 'All holdings valued'}
          icon={<Scale className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard
          label="Unrealised gain / loss"
          value={p.valuedCount ? <span className={p.unrealized >= 0 ? 'text-good-fg' : 'text-bad-fg'}>{money(p.unrealized, { decimals: 0, sign: true })}</span> : '—'}
          sub={p.returnPct != null ? `${formatPct(p.returnPct, { sign: true })} on ${money(p.valuedInvested, { decimals: 0 })} valued capital` : 'Add a valuation to see returns'}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={p.unrealized >= 0 ? 'good' : 'bad'}
        />
        <StatCard label="Net worth (tracked)" value={money(p.netWorth, { decimals: 0 })} sub={p.unvaluedCount ? `incl. ${money(p.unvaluedCost, { decimals: 0 })} at cost` : p.liabilities ? `after ${money(p.liabilities, { decimals: 0 })} liabilities` : 'Assets − liabilities'} icon={<Landmark className="h-4 w-4" />} />
      </div>

      {(p.hasEstimates || p.unvaluedCount > 0 || stale.length > 0 || p.holdings.some((h) => h.investment.currency !== settings.baseCurrency)) && (
        <div className="flex gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-fg-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div className="space-y-1">
            {p.hasEstimates && <p>* Some values are estimates (your own estimate or calculated from an FD rate) — they're labelled on each holding.</p>}
            {p.unvaluedCount > 0 && <p>{p.unvaluedCount} holding(s) have no valuation yet. They're counted at cost in net worth and excluded from returns. <button className="text-accent hover:underline" onClick={() => quick('valuation')}>Update a value</button></p>}
            {stale.length > 0 && <p>Valuations older than 45 days: {stale.map((h) => h.investment.name).join(', ')}.</p>}
            {p.holdings.some((h) => h.investment.currency !== settings.baseCurrency) && <p>Some holdings are in another currency. Portfolio totals add them as-is (no exchange-rate conversion).</p>}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Net worth vs invested capital"
            subtitle="Month-end. Uses your valuations; holdings without one are shown at cost."
            action={<Segmented size="sm" value={range} onChange={setRange} options={[{ value: '12', label: '1Y' }, { value: '24', label: '2Y' }, { value: 'all', label: 'All' }]} />}
          />
          <CardBody>
            <TrendChart
              height={250}
              showLegend
              data={series.nw.map((x) => ({ month: formatMonth(x.month, 'short'), 'Net worth': x.netWorth, Invested: x.invested }))}
              xKey="month"
              series={[
                { key: 'Net worth', label: 'Net worth', color: t.wealth },
                { key: 'Invested', label: 'Invested capital', color: t.series[0], dashed: true },
              ]}
              formatY={(v) => money(v, { compact: true })}
              yWidth={56}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Asset allocation" subtitle="By current value (cost if unvalued)" />
          <CardBody>
            {alloc.length ? (
              <DonutWithLegend size={140} data={alloc.map((a, i) => ({ label: a.label + (a.atCost ? ' (at cost)' : ''), value: a.value, color: t.series[i % 8] }))} format={(v) => money(v, { compact: true })} />
            ) : (
              <p className="py-10 text-center text-sm text-muted">No assets yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Monthly contributions" subtitle={thisMonth ? `This month: ${money(thisMonth.net, { decimals: 0 })} net` : undefined} action={<ButtonLink to="/wealth/contributions" size="sm" variant="ghost">Details</ButtonLink>} />
          <CardBody>
            <BarsChart height={210} data={series.contrib.map((c) => ({ month: formatMonth(c.month, 'short'), Contributions: c.contributions, Withdrawals: c.withdrawals }))} xKey="month" showLegend series={[{ key: 'Contributions', label: 'Contributions', color: t.wealth }, { key: 'Withdrawals', label: 'Withdrawals', color: t.series[1] }]} formatY={(v) => money(v, { compact: true })} yWidth={56} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Coming up" icon={<CalendarClock className="h-4 w-4 text-muted" />} />
          <CardBody className="space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">SIP installments</p>
              {sipsDue.length === 0 ? (
                <p className="text-xs text-muted">No active SIPs.</p>
              ) : (
                <ul className="space-y-1.5">
                  {sipsDue.slice(0, 5).map(({ h, next }) => (
                    <li key={h.investment.id} className="flex justify-between gap-2 text-sm">
                      <Link to={`/wealth/holdings/${h.investment.id}`} className="truncate text-fg-2 hover:text-fg">
                        {h.investment.name}
                      </Link>
                      <span className={cn('shrink-0 text-xs', next < today ? 'text-warn' : 'text-muted')}>
                        {money(h.investment.sip!.amount, { decimals: 0 })} · {next < today ? 'Due — record it' : relativeDays(next, today)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">FD maturities</p>
              {maturing.length === 0 ? (
                <p className="text-xs text-muted">None upcoming.</p>
              ) : (
                <ul className="space-y-1.5">
                  {maturing.slice(0, 4).map((h) => (
                    <li key={h.investment.id} className="flex justify-between gap-2 text-sm">
                      <span className="truncate text-fg-2">{h.investment.name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDate(h.maturity!.date, 'short')} · {money(h.maturity!.amount, { decimals: 0 })}
                        {h.maturity!.calculated && ' (calc.)'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Holdings" action={<Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => quick('investment')}>Add</Button>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-2.5 font-medium">Investment</th>
                <th className="px-3 py-2.5 text-right font-medium">Invested</th>
                <th className="px-3 py-2.5 text-right font-medium">Current value</th>
                <th className="px-3 py-2.5 font-medium">Value source</th>
                <th className="px-3 py-2.5 text-right font-medium">Gain / loss</th>
                <th className="px-5 py-2.5 text-right font-medium">Return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {p.holdings.map((h) => (
                <tr key={h.investment.id} className="hover:bg-surface-2/40">
                  <td className="px-5 py-2.5">
                    <Link to={`/wealth/holdings/${h.investment.id}`} className="font-medium text-fg hover:underline">
                      {h.investment.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {h.investment.provider || '—'}
                      {h.investment.isLiability && ' · Liability'}
                    </div>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-fg-2">{money(h.netInvested, { decimals: 0 })}</td>
                  <td className="tabular px-3 py-2.5 text-right text-fg">{h.value == null ? '—' : money(h.value, { decimals: 0 })}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={h.source === 'actual' ? 'good' : h.source === 'none' ? 'default' : 'warn'}>{VALUE_SOURCE_LABELS[h.source]}</Badge>
                    {h.valuationDate && <div className="mt-0.5 text-[11px] text-muted">as of {formatDate(h.valuationDate)}{h.laterFlows ? ' + later flows' : ''}</div>}
                  </td>
                  <td className={cn('tabular px-3 py-2.5 text-right', h.unrealized == null ? 'text-muted' : h.unrealized >= 0 ? 'text-good-fg' : 'text-bad-fg')}>{h.unrealized == null || h.investment.isLiability ? '—' : money(h.unrealized, { decimals: 0, sign: true })}</td>
                  <td className="tabular px-5 py-2.5 text-right text-fg-2">
                    {h.returnPct == null || h.investment.isLiability ? '—' : formatPct(h.returnPct, { sign: true })}
                    {h.xirr != null && <div className="text-[11px] text-muted">XIRR {formatPct(h.xirr, { sign: true })}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Return = (unrealised gain + interest/dividends paid out − fees) ÷ net invested. XIRR is annualised and only shown when a valuation exists. Contributions are never counted as profit.
      </p>
    </div>
  )
}
