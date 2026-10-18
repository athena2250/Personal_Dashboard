import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CalendarClock, ExternalLink, FileSpreadsheet, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { InvestmentTxn } from '@/data/models'
import { useInvestments, useInvTxns, useValuations } from '@/data/hooks'
import { deleteInvestment, deleteInvTxn, deleteValuation, recordSipInstallment } from '@/data/repos/wealth'
import { ASSET_TYPE_LABELS, holdingSummary, netWorthSeries, VALUE_SOURCE_LABELS } from '@/domain/wealth'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, Card, CardBody, CardHeader, EmptyState, Loading, StatCard } from '@/components/ui/display'
import { TrendChart } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { formatDate, formatMonth, monthKey, relativeDays } from '@/lib/dates'
import { formatMoney, formatPct } from '@/lib/money'
import { cn, isSafeUrl } from '@/lib/util'
import { InvestmentFormModal, InvTxnFormModal, ValuationFormModal } from './forms'

const TXN_LABEL: Record<InvestmentTxn['type'], string> = { contribution: 'Contribution', withdrawal: 'Withdrawal', income: 'Interest / dividend', fee: 'Fee' }

export function HoldingDetailPage() {
  const { id } = useParams()
  const { today } = useApp()
  const investments = useInvestments()
  const txns = useInvTxns(id)
  const vals = useValuations(id)
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const t = useChartTheme()
  const [edit, setEdit] = useState(false)
  const [entry, setEntry] = useState<InvestmentTxn | null | undefined>(undefined)
  const [valuing, setValuing] = useState(false)
  const inv = investments?.find((i) => i.id === id)

  const h = useMemo(() => (inv && txns && vals ? holdingSummary(inv, txns, vals, today) : null), [inv, txns, vals, today])
  const chart = useMemo(() => {
    if (!inv || !txns || !vals) return []
    const first = [inv.startDate, ...txns.map((x) => x.date)].sort()[0]
    return netWorthSeries([{ ...inv, isLiability: false }], txns, vals, monthKey(first), monthKey(today), today).map((p) => ({ month: formatMonth(p.month, 'short'), Value: p.netWorth, Invested: p.invested }))
  }, [inv, txns, vals, today])

  if (!investments || !txns || !vals) return <Loading />
  if (!inv || !h) return <EmptyState title="Investment not found" action={<ButtonLink to="/wealth/holdings">Back to holdings</ButtonLink>} />
  const cur = (v: number | null | undefined) => formatMoney(v, inv.currency, { decimals: 0 })

  const remove = async () => {
    if (!(await confirm({ title: `Delete “${inv.name}”?`, message: `This deletes the investment, its ${txns.length} entries and ${vals.length} valuations. Your original spreadsheets are not affected.`, confirmLabel: 'Delete permanently', danger: true, typeToConfirm: inv.name }))) return
    try {
      await deleteInvestment(inv.id)
      toast.success('Investment deleted')
      navigate('/wealth/holdings')
    } catch (e) {
      toast.error(e)
    }
  }

  const sortedTx = [...txns].sort((a, b) => b.date.localeCompare(a.date))
  const sortedVals = [...vals].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-fg">
            {inv.name}
            <Badge tone="wealth">{inv.assetType === 'other' && inv.customType ? inv.customType : ASSET_TYPE_LABELS[inv.assetType]}</Badge>
            {inv.isLiability && <Badge tone="bad">Liability</Badge>}
            {inv.archived && <Badge>Archived</Badge>}
          </h2>
          <p className="text-sm text-muted">
            {inv.provider || 'No provider'} · started {formatDate(inv.startDate)} · {inv.currency}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setValuing(true)}>
            Update value
          </Button>
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEntry(null)}>
            Add entry
          </Button>
          <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEdit(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-bad-fg" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={remove}>
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invested capital" value={cur(h.netInvested)} sub={`${cur(h.contributions)} in · ${cur(h.withdrawals)} out`} />
        <StatCard label="Current value" value={h.value == null ? '—' : cur(h.value)} sub={<Badge tone={h.source === 'actual' ? 'good' : h.source === 'none' ? 'default' : 'warn'}>{VALUE_SOURCE_LABELS[h.source]}</Badge>} />
        <StatCard label="Unrealised gain / loss" value={h.unrealized == null ? '—' : <span className={h.unrealized >= 0 ? 'text-good-fg' : 'text-bad-fg'}>{formatMoney(h.unrealized, inv.currency, { decimals: 0, sign: true })}</span>} sub={h.returnPct != null ? `Return ${formatPct(h.returnPct, { sign: true })}${h.xirr != null ? ` · XIRR ${formatPct(h.xirr, { sign: true })}` : ''}` : 'Needs a valuation'} />
        <StatCard label="Realised (paid out)" value={cur(h.realized)} sub="Interest / dividends − fees" />
      </div>
      {h.valuationDate && (
        <p className="text-xs text-muted">
          Value based on the {h.source} valuation from {formatDate(h.valuationDate)}
          {h.laterFlows ? `, plus ${cur(h.laterFlows)} of contributions recorded since (no market movement assumed for those).` : '.'}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Invested vs value over time" subtitle="Month-end values" />
          <CardBody>
            {chart.length > 1 ? (
              <TrendChart height={230} showLegend data={chart} xKey="month" series={[{ key: 'Value', label: 'Value (valuation or cost)', color: t.wealth }, { key: 'Invested', label: 'Invested capital', color: t.series[0], dashed: true }]} formatY={(v) => formatMoney(v, inv.currency, { compact: true })} yWidth={56} />
            ) : (
              <p className="py-10 text-center text-sm text-muted">Needs at least two months of history.</p>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          {inv.sip && (
            <Card>
              <CardHeader title="SIP plan" icon={<CalendarClock className="h-4 w-4 text-muted" />} />
              <CardBody className="space-y-2 text-sm">
                <p className="text-fg">
                  {cur(inv.sip.amount)} <span className="text-muted">{inv.sip.frequency}</span>
                </p>
                <p className="text-xs text-muted">Started {formatDate(inv.sip.startDate)} · {txns.filter((x) => x.source === 'sip').length} installments recorded</p>
                {inv.sip.active ? (
                  <>
                    <p className={cn('text-xs', inv.sip.nextDate <= today ? 'text-warn' : 'text-fg-2')}>Next installment {relativeDays(inv.sip.nextDate, today).toLowerCase()} ({formatDate(inv.sip.nextDate)})</p>
                    <Button size="sm" variant={inv.sip.nextDate <= today ? 'primary' : 'secondary'} onClick={() => recordSipInstallment(inv).then(() => toast.success(`Recorded ${cur(inv.sip!.amount)} installment for ${formatDate(inv.sip!.nextDate)}`)).catch(toast.error)}>
                      Record installment ({formatDate(inv.sip.nextDate, 'short')})
                    </Button>
                    <p className="text-[11px] text-muted">Recording adds a contribution and moves the next date forward. It does not change the value.</p>
                  </>
                ) : (
                  <Badge>Paused</Badge>
                )}
              </CardBody>
            </Card>
          )}
          {inv.assetType === 'fd' && (
            <Card>
              <CardHeader title="Deposit terms" />
              <CardBody className="space-y-1 text-sm text-fg-2">
                <p>Rate: {inv.interestRate != null ? `${inv.interestRate}% p.a. (${inv.compounding ?? 'quarterly'})` : '—'}</p>
                <p>Maturity date: {inv.maturityDate ? formatDate(inv.maturityDate) : '—'}</p>
                <p>
                  Maturity amount: {h.maturity ? cur(h.maturity.amount) : '—'} {h.maturity?.calculated && <Badge tone="warn">calculated</Badge>}
                </p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Linked files" icon={<FileSpreadsheet className="h-4 w-4 text-muted" />} />
            <CardBody>
              {inv.links.filter((l) => isSafeUrl(l.url)).length === 0 ? (
                <p className="text-xs text-muted">Link your original OneDrive / Excel Online tracker via Edit. Links open the file; nothing is modified.</p>
              ) : (
                <ul className="space-y-1.5">
                  {inv.links
                    .filter((l) => isSafeUrl(l.url))
                    .map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-accent hover:underline">
                          {l.label || l.url} <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </CardBody>
          </Card>
          {inv.notes && (
            <Card>
              <CardHeader title="Notes" />
              <CardBody className="text-sm whitespace-pre-wrap text-fg-2">{inv.notes}</CardBody>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Transaction history" subtitle={`${txns.length} entries`} action={<Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEntry(null)}>Add</Button>} />
          {sortedTx.length === 0 ? (
            <EmptyState compact title="No entries yet" description="Record contributions, withdrawals and interest." />
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {sortedTx.map((x) => (
                <li key={x.id} className="group flex items-center gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-fg">
                      {TXN_LABEL[x.type]} {x.source !== 'manual' && <Badge>{x.source === 'sip' ? 'SIP' : 'Imported'}</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(x.date)}
                      {x.units != null ? ` · ${x.units} units` : ''}
                      {x.nav != null ? ` @ ${x.nav}` : ''}
                      {x.notes ? ` · ${x.notes}` : ''}
                    </p>
                  </div>
                  <span className={cn('tabular', x.type === 'contribution' ? 'text-fg' : x.type === 'withdrawal' || x.type === 'fee' ? 'text-spending' : 'text-good-fg')}>
                    {x.type === 'withdrawal' || x.type === 'fee' ? '−' : '+'}
                    {cur(x.amount)}
                  </span>
                  <Button size="icon-sm" variant="ghost" aria-label="Edit entry" onClick={() => setEntry(x)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete entry" onClick={async () => { if (await confirm({ title: 'Delete entry?', message: `${TXN_LABEL[x.type]} of ${cur(x.amount)} on ${formatDate(x.date)}`, confirmLabel: 'Delete', danger: true })) deleteInvTxn(x.id).then(() => toast.success('Entry deleted')).catch(toast.error) }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Valuation history" subtitle="Manual updates from statements or your estimates" action={<Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setValuing(true)}>Update</Button>} />
          {sortedVals.length === 0 ? (
            <EmptyState compact title="No valuations yet" description={inv.assetType === 'fd' ? 'Optional for FDs — a calculated estimate is shown from the rate.' : 'Enter the current value from Groww or your statement to see returns.'} />
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {sortedVals.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-fg">{formatDate(v.date)}</p>
                    <p className="text-xs text-muted">{v.notes}</p>
                  </div>
                  <Badge tone={v.source === 'actual' ? 'good' : 'warn'}>{v.source === 'actual' ? 'Actual' : 'Estimate'}</Badge>
                  <span className="tabular text-fg">{cur(v.value)}</span>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete valuation" onClick={async () => { if (await confirm({ title: 'Delete valuation?', message: `${cur(v.value)} on ${formatDate(v.date)}`, confirmLabel: 'Delete', danger: true })) deleteValuation(v.id).then(() => toast.success('Valuation deleted')).catch(toast.error) }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <InvestmentFormModal open={edit} onClose={() => setEdit(false)} investment={inv} />
      <InvTxnFormModal open={entry !== undefined} onClose={() => setEntry(undefined)} investmentId={inv.id} txn={entry ?? undefined} />
      <ValuationFormModal open={valuing} onClose={() => setValuing(false)} investmentId={inv.id} />
    </div>
  )
}
