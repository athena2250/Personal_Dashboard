import { describe, expect, it } from 'vitest'
import { budgetStatuses, categoryBreakdown, dueOccurrences, monthSummary, overallBudget, upcomingRecurring, yearReport, changePct } from '../spending'
import { nextOccurrence, occurrencesBetween } from '../recurrence'
import { allocationByType, fdValue, holdingSummary, netWorthSeries, portfolioSummary, contributionsByMonth } from '../wealth'
import { xirr } from '../xirr'
import { TOTAL_BUDGET, type Budget, type Investment, type InvestmentTxn, type RecurringRule, type Transaction, type Valuation } from '@/data/models'
import { parseAmount } from '@/lib/money'
import { parseDate, autoMap, toCsv, parseCsv } from '../csv'

let n = 0
const base = () => ({ id: String(++n), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })
const tx = (date: string, type: 'income' | 'expense', amount: number, category = 'Food', fxRate = 1): Transaction => ({
  ...base(),
  date,
  type,
  amount,
  currency: 'INR',
  fxRate,
  category,
  merchant: 'm',
  tags: [],
})
const budget = (category: string, amount: number, month = '*'): Budget => ({ ...base(), category, amount, month })

describe('spending', () => {
  const txs = [
    tx('2026-10-01', 'income', 100000, 'Salary'),
    tx('2026-10-02', 'expense', 20000, 'Rent'),
    tx('2026-10-05', 'expense', 3000, 'Food'),
    tx('2026-10-06', 'expense', 100, 'Food', 83), // USD converted
    tx('2026-09-05', 'expense', 5000, 'Food'),
  ]

  it('summarises a month with fx conversion and savings rate', () => {
    const s = monthSummary(txs, '2026-10')
    expect(s.income).toBe(100000)
    expect(s.expenses).toBe(20000 + 3000 + 8300)
    expect(s.savingsRate).toBeCloseTo((100000 - 31300) / 100000)
  })

  it('savings rate is null without income', () => {
    expect(monthSummary(txs, '2026-09').savingsRate).toBeNull()
  })

  it('category breakdown sorted by amount', () => {
    const b = categoryBreakdown(txs.filter((t) => t.date.startsWith('2026-10')))
    expect(b[0].category).toBe('Rent')
    expect(b[1]).toMatchObject({ category: 'Food', amount: 11300, count: 2 })
  })

  it('budget statuses with overrides and warnings', () => {
    const budgets = [budget('Food', 12000), budget('Food', 10000, '2026-10'), budget('Rent', 20000), budget(TOTAL_BUDGET, 30000)]
    const st = budgetStatuses(txs, budgets, '2026-10', 0.8)
    const food = st.find((x) => x.category === 'Food')!
    expect(food.budget).toBe(10000)
    expect(food.isOverride).toBe(true)
    expect(food.state).toBe('over')
    expect(st.find((x) => x.category === 'Rent')!.state).toBe('warning') // exactly 100% → warning, not over
    expect(st[0].category).toBe(TOTAL_BUDGET)
    expect(st[0].state).toBe('over')
    expect(budgetStatuses(txs, budgets, '2026-09').find((x) => x.category === 'Food')!.budget).toBe(12000)
  })

  it('overall budget falls back to sum of categories', () => {
    expect(overallBudget([budget('Food', 100), budget('Rent', 200)], '2026-10')).toEqual({ amount: 300, explicit: false })
    expect(overallBudget([], '2026-10')).toBeNull()
  })

  it('year report', () => {
    const y = yearReport(txs, 2026, '2026-10-18')
    expect(y.months).toHaveLength(10)
    expect(y.expenses).toBe(36300)
    expect(y.avgMonthlyExpense).toBe(36300 / 2)
  })

  it('changePct handles zero', () => {
    expect(changePct(10, 0)).toBeNull()
    expect(changePct(0, 0)).toBe(0)
    expect(changePct(15, 10)).toBeCloseTo(0.5)
  })
})

describe('recurrence', () => {
  it('clamps month ends and keeps anchor day', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', 1, 31)).toBe('2026-02-28')
    expect(nextOccurrence('2026-02-28', 'monthly', 1, 31)).toBe('2026-03-31')
    expect(nextOccurrence('2024-02-29', 'yearly', 1, 29)).toBe('2025-02-28')
    expect(nextOccurrence('2026-01-01', 'quarterly')).toBe('2026-04-01')
    expect(nextOccurrence('2026-01-01', 'weekly', 2)).toBe('2026-01-15')
  })

  it('lists occurrences in range', () => {
    expect(occurrencesBetween('2026-01-15', 'monthly', 1, '2026-03-01', '2026-05-31')).toEqual(['2026-03-15', '2026-04-15', '2026-05-15'])
    expect(occurrencesBetween('2026-01-15', 'monthly', 1, '2026-01-01', '2026-12-31', { endDate: '2026-02-20' })).toEqual(['2026-01-15', '2026-02-15'])
  })

  it('due and upcoming recurring', () => {
    const rule: RecurringRule = { ...base(), type: 'expense', amount: 500, currency: 'INR', fxRate: 1, category: 'Subs', merchant: 'Netflix', tags: [], frequency: 'monthly', interval: 1, startDate: '2026-08-10', nextDate: '2026-08-10', anchorDay: 10, autoPost: true, active: true }
    expect(dueOccurrences(rule, '2026-10-18')).toEqual(['2026-08-10', '2026-09-10', '2026-10-10'])
    const up = upcomingRecurring([{ ...rule, nextDate: '2026-10-20', anchorDay: 20 }], '2026-10-18', 40)
    expect(up.map((u) => u.date)).toEqual(['2026-10-20', '2026-11-20'])
    expect(dueOccurrences({ ...rule, active: false }, '2026-10-18')).toEqual([])
  })
})

const inv = (p: Partial<Investment>): Investment => ({
  ...base(),
  name: 'X',
  provider: '',
  assetType: 'sip',
  currency: 'INR',
  startDate: '2025-01-01',
  isLiability: false,
  links: [],
  archived: false,
  ...p,
})
const itx = (investmentId: string, date: string, amount: number, type: InvestmentTxn['type'] = 'contribution'): InvestmentTxn => ({ ...base(), investmentId, date, amount, type, source: 'manual' })
const val = (investmentId: string, date: string, value: number, source: Valuation['source'] = 'actual'): Valuation => ({ ...base(), investmentId, date, value, source })

describe('wealth', () => {
  it('FD compound interest (quarterly)', () => {
    // 1,00,000 at 7% quarterly for exactly 365 days = 100000 * (1.0175)^4
    expect(fdValue(100000, 7, '2025-01-01', '2026-01-01', 'quarterly')).toBeCloseTo(107185.9, 0)
    expect(fdValue(100000, 7, '2025-01-01', '2026-01-01', 'simple')).toBe(107000)
  })

  it('never reports profit without a valuation', () => {
    const sip = inv({ id: 'sip' })
    const h = holdingSummary(sip, [itx('sip', '2025-01-05', 5000), itx('sip', '2025-02-05', 5000)], [], '2025-03-01')
    expect(h.netInvested).toBe(10000)
    expect(h.value).toBeNull()
    expect(h.unrealized).toBeNull()
    expect(h.returnPct).toBeNull()
    expect(h.source).toBe('none')
  })

  it('uses latest valuation plus later contributions', () => {
    const sip = inv({ id: 's2' })
    const txns = [itx('s2', '2025-01-05', 5000), itx('s2', '2025-02-05', 5000), itx('s2', '2025-03-05', 5000)]
    const h = holdingSummary(sip, txns, [val('s2', '2025-01-31', 5100), val('s2', '2025-02-28', 10300)], '2025-03-10')
    expect(h.value).toBe(15300)
    expect(h.laterFlows).toBe(5000)
    expect(h.unrealized).toBe(300)
    expect(h.returnPct).toBeCloseTo(0.02)
    expect(h.source).toBe('actual')
  })

  it('FD calculated estimate and maturity', () => {
    const fd = inv({ id: 'fd', assetType: 'fd', interestRate: 7, compounding: 'quarterly', startDate: '2025-01-01', maturityDate: '2026-01-01' })
    const h = holdingSummary(fd, [itx('fd', '2025-01-01', 100000)], [], '2027-01-01')
    expect(h.source).toBe('fd-calculated')
    expect(h.value).toBeCloseTo(107185.9, 0) // capped at maturity
    expect(h.maturity).toMatchObject({ calculated: true })
    const h2 = holdingSummary({ ...fd, maturityAmount: 107500 }, [itx('fd', '2025-01-01', 100000)], [], '2025-06-01')
    expect(h2.maturity).toEqual({ amount: 107500, calculated: false, date: '2026-01-01' })
  })

  it('portfolio separates valued and unvalued holdings', () => {
    const a = inv({ id: 'a' })
    const b = inv({ id: 'b', assetType: 'mutual_fund' })
    const loan = inv({ id: 'l', assetType: 'other', isLiability: true })
    const txns = [itx('a', '2025-01-01', 10000), itx('b', '2025-01-01', 20000), itx('l', '2025-01-01', 5000)]
    const p = portfolioSummary([a, b, loan], txns, [val('a', '2025-06-01', 12000)], '2025-06-02')
    expect(p.totalInvested).toBe(30000)
    expect(p.currentValue).toBe(12000)
    expect(p.valuedInvested).toBe(10000)
    expect(p.unrealized).toBe(2000)
    expect(p.unvaluedCount).toBe(1)
    expect(p.unvaluedCost).toBe(20000)
    expect(p.liabilities).toBe(5000)
    expect(p.netWorth).toBe(12000 + 20000 - 5000)
    const alloc = allocationByType(p)
    expect(alloc.find((x) => x.key === 'mutual_fund')).toMatchObject({ value: 20000, atCost: true })
  })

  it('contributions by month and net worth series', () => {
    const a = inv({ id: 'n' })
    const txns = [itx('n', '2025-01-05', 1000), itx('n', '2025-02-05', 1000), itx('n', '2025-02-20', 300, 'withdrawal')]
    expect(contributionsByMonth(txns, '2025-01', '2025-03').map((r) => r.net)).toEqual([1000, 700, 0])
    const s = netWorthSeries([a], txns, [val('n', '2025-01-31', 1100)], '2025-01', '2025-02', '2025-03-01')
    expect(s[0]).toMatchObject({ invested: 1000, netWorth: 1100, atCost: 0 })
    expect(s[1]).toMatchObject({ invested: 1700, netWorth: 1800 })
  })

  it('xirr matches a known value', () => {
    // Invest 1000, receive 1100 exactly one year later -> 10%
    expect(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }])!).toBeCloseTo(0.1, 3)
    expect(xirr([{ date: '2025-01-01', amount: -1000 }])).toBeNull()
  })
})

describe('parsing helpers', () => {
  it('parses amounts', () => {
    expect(parseAmount('₹1,23,456.50')).toBe(123456.5)
    expect(parseAmount('(1,200)')).toBe(-1200)
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('-45')).toBe(-45)
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })

  it('parses dates', () => {
    expect(parseDate('2026-03-05')).toBe('2026-03-05')
    expect(parseDate('05/03/2026')).toBe('2026-03-05') // day-first default
    expect(parseDate('05/03/2026', 'MDY')).toBe('2026-05-03')
    expect(parseDate('25/12/2026')).toBe('2026-12-25')
    expect(parseDate('12/25/2026')).toBe('2026-12-25')
    expect(parseDate('5 Mar 2026')).toBe('2026-03-05')
    expect(parseDate('Mar 5, 2026')).toBe('2026-03-05')
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate(46000)).toBe('2025-12-09')
  })

  it('csv round trip and formula guarding', () => {
    const csv = toCsv([{ a: '=SUM(A1)', b: 'x, y', c: -5 }])
    expect(csv).toContain("'=SUM(A1)")
    const parsed = parseCsv(csv)
    expect(parsed.rows[0].b).toBe('x, y')
    expect(parsed.rows[0].c).toBe('-5')
  })

  it('auto maps columns', () => {
    const m = autoMap(['Txn Date', 'Description', 'Debit Amount', 'Category'], {
      date: ['date', 'txndate'],
      merchant: ['description', 'merchant', 'narration'],
      amount: ['amount', 'debit'],
      category: ['category'],
    })
    expect(m).toEqual({ date: 'Txn Date', merchant: 'Description', amount: 'Debit Amount', category: 'Category' })
  })
})
