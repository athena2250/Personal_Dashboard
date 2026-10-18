/**
 * Wealth / portfolio calculations.
 *
 * Rules:
 * - Invested capital = contributions − withdrawals. Contributions are never profit.
 * - Current value only comes from (a) user-entered valuations (actual or estimate), plus any
 *   contributions/withdrawals recorded after that valuation, or (b) a clearly labelled
 *   calculated estimate for fixed deposits from principal + interest rate, or (c) cash balance
 *   from recorded flows. Otherwise the value is unknown and no return is shown.
 */
import type { AssetType, Compounding, Investment, InvestmentTxn, Valuation } from '@/data/models'
import { diffDays, endOfMonth, minDate, monthKey, monthsBetween, type ISODate, type MonthKey } from '@/lib/dates'
import { round2 } from '@/lib/money'
import { xirr, type CashFlow } from './xirr'

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  sip: 'SIP',
  mutual_fund: 'Mutual fund',
  fd: 'Fixed deposit',
  stock: 'Stock',
  etf: 'ETF',
  cash: 'Cash & savings',
  other: 'Other',
}

export type ValueSource = 'actual' | 'estimate' | 'fd-calculated' | 'cash-balance' | 'none'

export const VALUE_SOURCE_LABELS: Record<ValueSource, string> = {
  actual: 'Actual (from statement)',
  estimate: 'Your estimate',
  'fd-calculated': 'Calculated from FD rate',
  'cash-balance': 'Balance from recorded flows',
  none: 'No valuation yet',
}

const PERIODS: Record<Exclude<Compounding, 'simple'>, number> = {
  monthly: 12,
  quarterly: 4,
  'half-yearly': 2,
  yearly: 1,
}

/** Value of a deposit at `asOf` given annual rate (%), compounding convention. */
export function fdValue(principal: number, ratePct: number, start: ISODate, asOf: ISODate, compounding: Compounding = 'quarterly'): number {
  const t = Math.max(0, diffDays(asOf, start)) / 365
  const r = ratePct / 100
  if (compounding === 'simple') return round2(principal * (1 + r * t))
  const n = PERIODS[compounding]
  return round2(principal * Math.pow(1 + r / n, n * t))
}

export interface HoldingFlows {
  contributions: number
  withdrawals: number
  income: number
  fees: number
  netInvested: number
}

export function flowsUpTo(txns: InvestmentTxn[], asOf?: ISODate, after?: ISODate): HoldingFlows {
  let contributions = 0
  let withdrawals = 0
  let income = 0
  let fees = 0
  for (const t of txns) {
    if (asOf && t.date > asOf) continue
    if (after && t.date <= after) continue
    if (t.type === 'contribution') contributions += t.amount
    else if (t.type === 'withdrawal') withdrawals += t.amount
    else if (t.type === 'income') income += t.amount
    else if (t.type === 'fee') fees += t.amount
  }
  return {
    contributions: round2(contributions),
    withdrawals: round2(withdrawals),
    income: round2(income),
    fees: round2(fees),
    netInvested: round2(contributions - withdrawals),
  }
}

export function latestValuation(vals: Valuation[], asOf?: ISODate): Valuation | undefined {
  let best: Valuation | undefined
  for (const v of vals) {
    if (asOf && v.date > asOf) continue
    if (!best || v.date > best.date || (v.date === best.date && v.createdAt > best.createdAt)) best = v
  }
  return best
}

export interface HoldingValue {
  value: number | null
  source: ValueSource
  valuationDate?: ISODate
  /** Net flows recorded after the latest valuation that were added on top of it. */
  laterFlows: number
}

export function holdingValueAt(inv: Investment, txns: InvestmentTxn[], vals: Valuation[], asOf: ISODate): HoldingValue {
  const v = latestValuation(vals, asOf)
  if (v) {
    const later = flowsUpTo(txns, asOf, v.date)
    return { value: round2(v.value + later.netInvested), source: v.source, valuationDate: v.date, laterFlows: later.netInvested }
  }
  if (inv.assetType === 'fd' && inv.interestRate != null && inv.interestRate > 0) {
    const end = inv.maturityDate ? minDate(asOf, inv.maturityDate) : asOf
    let total = 0
    let any = false
    for (const t of txns) {
      if (t.date > asOf) continue
      if (t.type === 'contribution') {
        total += fdValue(t.amount, inv.interestRate, t.date, end, inv.compounding ?? 'quarterly')
        any = true
      } else if (t.type === 'withdrawal') total -= t.amount
    }
    if (any) return { value: round2(total), source: 'fd-calculated', laterFlows: 0 }
  }
  if (inv.assetType === 'cash') {
    const f = flowsUpTo(txns, asOf)
    if (txns.some((t) => t.date <= asOf)) return { value: round2(f.netInvested + f.income - f.fees), source: 'cash-balance', laterFlows: 0 }
  }
  return { value: null, source: 'none', laterFlows: 0 }
}

export interface HoldingSummary extends HoldingFlows {
  investment: Investment
  value: number | null
  source: ValueSource
  valuationDate?: ISODate
  laterFlows: number
  /** Unrealised gain = value − net invested. Null when value unknown. */
  unrealized: number | null
  /** Realised = income paid out − fees. */
  realized: number
  returnPct: number | null
  xirr: number | null
  /** For FDs: projected maturity amount (user-provided wins over calculated). */
  maturity?: { amount: number; calculated: boolean; date: ISODate }
}

export function holdingSummary(inv: Investment, txns: InvestmentTxn[], vals: Valuation[], today: ISODate): HoldingSummary {
  const flows = flowsUpTo(txns, today)
  const hv = holdingValueAt(inv, txns, vals, today)
  const unrealized = hv.value == null ? null : round2(hv.value - flows.netInvested)
  const realized = round2(flows.income - flows.fees)
  const returnPct = unrealized != null && flows.netInvested > 0 ? (unrealized + realized) / flows.netInvested : null

  let irr: number | null = null
  if (hv.value != null && !inv.isLiability) {
    const cfs: CashFlow[] = txns
      .filter((t) => t.date <= today)
      .map((t) => ({
        date: t.date,
        amount: t.type === 'contribution' || t.type === 'fee' ? -t.amount : t.amount,
      }))
    cfs.push({ date: hv.valuationDate && hv.laterFlows === 0 ? hv.valuationDate : today, amount: hv.value })
    irr = xirr(cfs)
    if (irr != null && (irr > 10 || irr < -0.99)) irr = null
  }

  let maturity: HoldingSummary['maturity']
  if (inv.assetType === 'fd' && inv.maturityDate) {
    if (inv.maturityAmount && inv.maturityAmount > 0) maturity = { amount: inv.maturityAmount, calculated: false, date: inv.maturityDate }
    else if (inv.interestRate) {
      const amount = txns
        .filter((t) => t.type === 'contribution')
        .reduce((s, t) => s + fdValue(t.amount, inv.interestRate!, t.date, inv.maturityDate!, inv.compounding ?? 'quarterly'), 0)
      if (amount > 0) maturity = { amount: round2(amount), calculated: true, date: inv.maturityDate }
    }
  }

  return {
    investment: inv,
    ...flows,
    value: hv.value,
    source: hv.source,
    valuationDate: hv.valuationDate,
    laterFlows: hv.laterFlows,
    unrealized,
    realized,
    returnPct,
    xirr: irr,
    maturity,
  }
}

export interface PortfolioSummary {
  holdings: HoldingSummary[]
  totalInvested: number
  /** Sum of known values (assets only). */
  currentValue: number
  /** Net invested of the holdings that have a known value. */
  valuedInvested: number
  unrealized: number
  realized: number
  returnPct: number | null
  valuedCount: number
  unvaluedCount: number
  /** Cost basis of unvalued holdings (used as a labelled fallback in net worth). */
  unvaluedCost: number
  hasEstimates: boolean
  liabilities: number
  /** Assets valued (or at cost when unknown) − liabilities. */
  netWorth: number
}

export function portfolioSummary(
  investments: Investment[],
  txns: InvestmentTxn[],
  vals: Valuation[],
  today: ISODate,
): PortfolioSummary {
  const byInvTx = groupMap(txns, (t) => t.investmentId)
  const byInvVal = groupMap(vals, (v) => v.investmentId)
  const holdings = investments
    .filter((i) => !i.archived)
    .map((i) => holdingSummary(i, byInvTx.get(i.id) ?? [], byInvVal.get(i.id) ?? [], today))
  const assets = holdings.filter((h) => !h.investment.isLiability)
  const liabilitiesList = holdings.filter((h) => h.investment.isLiability)
  const valued = assets.filter((h) => h.value != null)
  const unvalued = assets.filter((h) => h.value == null)
  const totalInvested = round2(assets.reduce((s, h) => s + h.netInvested, 0))
  const currentValue = round2(valued.reduce((s, h) => s + (h.value ?? 0), 0))
  const valuedInvested = round2(valued.reduce((s, h) => s + h.netInvested, 0))
  const unrealized = round2(currentValue - valuedInvested)
  const realized = round2(assets.reduce((s, h) => s + h.realized, 0))
  const unvaluedCost = round2(unvalued.reduce((s, h) => s + h.netInvested, 0))
  const liabilities = round2(liabilitiesList.reduce((s, h) => s + (h.value ?? h.netInvested), 0))
  return {
    holdings,
    totalInvested,
    currentValue,
    valuedInvested,
    unrealized,
    realized,
    returnPct: valuedInvested > 0 ? (unrealized + realized) / valuedInvested : null,
    valuedCount: valued.length,
    unvaluedCount: unvalued.length,
    unvaluedCost,
    hasEstimates: valued.some((h) => h.source === 'estimate' || h.source === 'fd-calculated'),
    liabilities,
    netWorth: round2(currentValue + unvaluedCost - liabilities),
  }
}

export interface AllocationSlice {
  key: string
  label: string
  value: number
  atCost: boolean
}

export function allocationByType(p: PortfolioSummary): AllocationSlice[] {
  const m = new Map<string, AllocationSlice>()
  for (const h of p.holdings) {
    if (h.investment.isLiability) continue
    const key = h.investment.assetType === 'other' && h.investment.customType ? `other:${h.investment.customType}` : h.investment.assetType
    const label = h.investment.assetType === 'other' && h.investment.customType ? h.investment.customType : ASSET_TYPE_LABELS[h.investment.assetType]
    const v = h.value ?? h.netInvested
    const cur = m.get(key) ?? { key, label, value: 0, atCost: false }
    cur.value = round2(cur.value + v)
    if (h.value == null) cur.atCost = true
    m.set(key, cur)
  }
  return [...m.values()].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
}

export function contributionsByMonth(txns: InvestmentTxn[], from: MonthKey, to: MonthKey) {
  const months = monthsBetween(from, to)
  const m = new Map(months.map((k) => [k, { month: k, contributions: 0, withdrawals: 0 }]))
  for (const t of txns) {
    const row = m.get(monthKey(t.date))
    if (!row) continue
    if (t.type === 'contribution') row.contributions += t.amount
    if (t.type === 'withdrawal') row.withdrawals += t.amount
  }
  return [...m.values()].map((r) => ({ ...r, contributions: round2(r.contributions), withdrawals: round2(r.withdrawals), net: round2(r.contributions - r.withdrawals) }))
}

export interface NetWorthPoint {
  month: MonthKey
  invested: number
  /** Known values + cost basis for unvalued holdings − liabilities. */
  netWorth: number
  /** Portion of netWorth that comes from cost basis (no valuation available). */
  atCost: number
}

export function netWorthSeries(
  investments: Investment[],
  txns: InvestmentTxn[],
  vals: Valuation[],
  from: MonthKey,
  to: MonthKey,
  today: ISODate,
): NetWorthPoint[] {
  const byInvTx = groupMap(txns, (t) => t.investmentId)
  const byInvVal = groupMap(vals, (v) => v.investmentId)
  const active = investments.filter((i) => !i.archived)
  return monthsBetween(from, to).map((month) => {
    const asOf = minDate(endOfMonth(month), today)
    let invested = 0
    let net = 0
    let atCost = 0
    for (const inv of active) {
      const t = byInvTx.get(inv.id) ?? []
      const flows = flowsUpTo(t, asOf)
      const hv = holdingValueAt(inv, t, byInvVal.get(inv.id) ?? [], asOf)
      if (inv.isLiability) {
        net -= hv.value ?? flows.netInvested
        continue
      }
      invested += flows.netInvested
      if (hv.value != null) net += hv.value
      else {
        net += flows.netInvested
        atCost += flows.netInvested
      }
    }
    return { month, invested: round2(invested), netWorth: round2(net), atCost: round2(atCost) }
  })
}

function groupMap<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    const a = m.get(k)
    if (a) a.push(it)
    else m.set(k, [it])
  }
  return m
}
