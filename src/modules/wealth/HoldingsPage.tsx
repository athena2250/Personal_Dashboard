import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Archive, ArchiveRestore, Landmark, Plus, TrendingUp, Wallet, Banknote, Coins } from 'lucide-react'
import type { AssetType } from '@/data/models'
import { updateInvestment } from '@/data/repos/wealth'
import { ASSET_TYPE_LABELS, VALUE_SOURCE_LABELS, holdingSummary } from '@/domain/wealth'
import { Button } from '@/components/ui/Button'
import { Badge, Card, EmptyState, Loading, ProgressBar } from '@/components/ui/display'
import { useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { formatDate, relativeDays } from '@/lib/dates'
import { formatPct } from '@/lib/money'
import { cn } from '@/lib/util'
import { InvestmentFormModal } from './forms'
import { usePortfolio } from './usePortfolio'

const PRESET_BUTTONS: { type: AssetType; provider: string; label: string; icon: typeof Wallet }[] = [
  { type: 'sip', provider: 'Groww', label: 'SIP (Groww)', icon: TrendingUp },
  { type: 'fd', provider: 'HDFC Bank', label: 'Fixed deposit (HDFC)', icon: Landmark },
  { type: 'mutual_fund', provider: '', label: 'Mutual fund (lump sum)', icon: Coins },
  { type: 'stock', provider: '', label: 'Stock / ETF', icon: TrendingUp },
  { type: 'cash', provider: '', label: 'Cash / savings', icon: Banknote },
  { type: 'other', provider: '', label: 'Other asset', icon: Wallet },
]

export function HoldingsPage() {
  const { today, money } = useApp()
  const { investments, txns, vals } = usePortfolio(today)
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const add = params.get('add') as AssetType | null
  const [preset, setPreset] = useState<{ type: AssetType; provider: string } | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const openPreset = add ? { type: add, provider: add === 'sip' ? 'Groww' : add === 'fd' ? 'HDFC Bank' : '' } : preset

  if (!investments || !txns || !vals) return <Loading />
  const list = investments.filter((i) => showArchived || !i.archived).map((i) => holdingSummary(i, txns.filter((t) => t.investmentId === i.id), vals.filter((v) => v.investmentId === i.id), today))
  const groups = new Map<string, typeof list>()
  for (const h of list) {
    const k = h.investment.isLiability ? 'Liabilities' : h.investment.assetType === 'other' && h.investment.customType ? h.investment.customType : ASSET_TYPE_LABELS[h.investment.assetType]
    groups.set(k, [...(groups.get(k) ?? []), h])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {PRESET_BUTTONS.map((b) => (
          <Button key={b.label} size="sm" icon={<b.icon className="h-3.5 w-3.5" />} onClick={() => setPreset({ type: b.type, provider: b.provider })}>
            {b.label}
          </Button>
        ))}
        {investments.some((i) => i.archived) && (
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Plus className="h-5 w-5" />} title="No holdings yet" description="Use the buttons above. You can add as many accounts and asset types as you like." />
        </Card>
      ) : (
        [...groups.entries()].map(([group, items]) => (
          <section key={group}>
            <h2 className="mb-2 text-sm font-semibold text-fg-2">
              {group} <span className="font-normal text-muted">· {money(items.reduce((s, h) => s + (h.value ?? h.netInvested), 0), { decimals: 0 })}</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((h) => {
                const i = h.investment
                const sipDue = i.sip?.active && i.sip.nextDate <= today
                return (
                  <Card key={i.id} as="article" className={cn('flex flex-col p-4', i.archived && 'opacity-60')}>
                    <Link to={`/wealth/holdings/${i.id}`} className="group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate font-medium text-fg group-hover:underline">{i.name}</h3>
                          <p className="text-xs text-muted">
                            {i.provider || 'No provider'} · since {formatDate(i.startDate)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {i.demo && <Badge tone="warn">Demo</Badge>}
                          {sipDue && <Badge tone="warn">SIP due</Badge>}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-[11px] text-muted">Invested</div>
                          <div className="tabular font-medium text-fg">{money(h.netInvested, { decimals: 0 })}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted">Current value</div>
                          <div className="tabular font-medium text-fg">{h.value == null ? '—' : money(h.value, { decimals: 0 })}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <Badge tone={h.source === 'actual' ? 'good' : h.source === 'none' ? 'default' : 'warn'}>{VALUE_SOURCE_LABELS[h.source]}</Badge>
                        {h.unrealized != null && !i.isLiability && (
                          <span className={h.unrealized >= 0 ? 'text-good-fg' : 'text-bad-fg'}>
                            {money(h.unrealized, { decimals: 0, sign: true })} {h.returnPct != null && `(${formatPct(h.returnPct, { sign: true })})`}
                          </span>
                        )}
                      </div>
                      {i.sip && (
                        <p className="mt-3 text-xs text-fg-2">
                          SIP {money(i.sip.amount, { decimals: 0 })} {i.sip.frequency} · {i.sip.active ? `next ${relativeDays(i.sip.nextDate, today).toLowerCase()}` : 'paused'}
                        </p>
                      )}
                      {i.assetType === 'fd' && h.maturity && (
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-[11px] text-muted">
                            <span>{i.interestRate}% p.a.</span>
                            <span>Matures {formatDate(h.maturity.date)}</span>
                          </div>
                          <ProgressBar value={(Date.parse(today) - Date.parse(i.startDate)) / (Date.parse(h.maturity.date) - Date.parse(i.startDate))} color="var(--wealth)" label="Time to maturity" />
                        </div>
                      )}
                    </Link>
                    <div className="mt-auto flex justify-end pt-3">
                      <Button size="sm" variant="ghost" icon={i.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} onClick={() => updateInvestment(i.id, { archived: !i.archived }).then(() => toast.success(i.archived ? 'Restored' : 'Archived — excluded from totals')).catch(toast.error)}>
                        {i.archived ? 'Restore' : 'Archive'}
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        ))
      )}
      <InvestmentFormModal
        open={!!openPreset}
        onClose={() => {
          setPreset(null)
          if (add) setParams({}, { replace: true })
        }}
        presetType={openPreset?.type}
        presetProvider={openPreset?.provider}
      />
    </div>
  )
}
