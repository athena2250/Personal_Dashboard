/**
 * Spending analytics. All amounts are converted to the base currency with `fxRate`.
 * Calculations only use recorded transactions — nothing is estimated.
 */
import { TOTAL_BUDGET, type Budget, type RecurringRule, type Transaction } from '@/data/models'
import { addMonthKey, endOfMonth, monthKey, monthsBetween, type ISODate, type MonthKey } from '@/lib/dates'
import { round2 } from '@/lib/money'
import { occurrencesBetween } from './recurrence'

export function baseAmount(t: Pick<Transaction, 'amount' | 'fxRate'>): number {
  return (t.amount || 0) * (t.fxRate || 1)
}

export function txInMonth(txs: Transaction[], month: MonthKey): Transaction[] {
  return txs.filter((t) => t.date.startsWith(month))
}

export interface MonthSummary {
  month: MonthKey
  income: number
  expenses: number
  net: number
  /** (income − expenses) / income, null when no income recorded. */
  savingsRate: number | null
  count: number
}

export function monthSummary(txs: Transaction[], month: MonthKey): MonthSummary {
  let income = 0
  let expenses = 0
  let count = 0
  for (const t of txs) {
    if (!t.date.startsWith(month)) continue
    count++
    if (t.type === 'income') income += baseAmount(t)
    else expenses += baseAmount(t)
  }
  income = round2(income)
  expenses = round2(expenses)
  return {
    month,
    income,
    expenses,
    net: round2(income - expenses),
    savingsRate: income > 0 ? (income - expenses) / income : null,
    count,
  }
}

export function monthlyTrend(txs: Transaction[], endMonth: MonthKey, months: number): MonthSummary[] {
  const from = addMonthKey(endMonth, -(months - 1))
  return monthsBetween(from, endMonth).map((m) => monthSummary(txs, m))
}

export interface CategoryTotal {
  category: string
  amount: number
  count: number
  share: number
}

export function categoryBreakdown(txs: Transaction[], type: 'expense' | 'income' = 'expense'): CategoryTotal[] {
  const m = new Map<string, { amount: number; count: number }>()
  let total = 0
  for (const t of txs) {
    if (t.type !== type) continue
    const a = baseAmount(t)
    total += a
    const cur = m.get(t.category) ?? { amount: 0, count: 0 }
    cur.amount += a
    cur.count++
    m.set(t.category, cur)
  }
  return [...m.entries()]
    .map(([category, v]) => ({ category, amount: round2(v.amount), count: v.count, share: total > 0 ? v.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

/** Resolves the budget for a category in a month: month-specific overrides the '*' default. */
export function budgetFor(budgets: Budget[], category: string, month: MonthKey): Budget | undefined {
  return (
    budgets.find((b) => b.category === category && b.month === month) ??
    budgets.find((b) => b.category === category && b.month === '*')
  )
}

export type BudgetState = 'ok' | 'warning' | 'over'

export interface BudgetStatus {
  category: string
  budget: number
  spent: number
  remaining: number
  utilization: number
  state: BudgetState
  isOverride: boolean
}

export function budgetState(spent: number, budget: number, warnAt = 0.8): BudgetState {
  if (budget <= 0) return spent > 0 ? 'over' : 'ok'
  const u = spent / budget
  if (u > 1) return 'over'
  if (u >= warnAt) return 'warning'
  return 'ok'
}

export function budgetStatuses(txs: Transaction[], budgets: Budget[], month: MonthKey, warnAt = 0.8): BudgetStatus[] {
  const monthTx = txInMonth(txs, month).filter((t) => t.type === 'expense')
  const categories = new Set(budgets.filter((b) => b.month === '*' || b.month === month).map((b) => b.category))
  const out: BudgetStatus[] = []
  for (const cat of categories) {
    const b = budgetFor(budgets, cat, month)
    if (!b) continue
    const spent = round2(
      monthTx.filter((t) => cat === TOTAL_BUDGET || t.category === cat).reduce((s, t) => s + baseAmount(t), 0),
    )
    out.push({
      category: cat,
      budget: b.amount,
      spent,
      remaining: round2(b.amount - spent),
      utilization: b.amount > 0 ? spent / b.amount : spent > 0 ? Infinity : 0,
      state: budgetState(spent, b.amount, warnAt),
      isOverride: b.month !== '*',
    })
  }
  return out.sort((a, b) => (a.category === TOTAL_BUDGET ? -1 : b.category === TOTAL_BUDGET ? 1 : b.utilization - a.utilization))
}

/**
 * Overall monthly budget: the explicit total budget if one is set,
 * otherwise the sum of category budgets (null when none exist).
 */
export function overallBudget(budgets: Budget[], month: MonthKey): { amount: number; explicit: boolean } | null {
  const total = budgetFor(budgets, TOTAL_BUDGET, month)
  if (total) return { amount: total.amount, explicit: true }
  const cats = new Set(budgets.filter((b) => b.category !== TOTAL_BUDGET).map((b) => b.category))
  let sum = 0
  let any = false
  for (const c of cats) {
    const b = budgetFor(budgets, c, month)
    if (b) {
      sum += b.amount
      any = true
    }
  }
  return any ? { amount: round2(sum), explicit: false } : null
}

export interface UpcomingRecurring {
  rule: RecurringRule
  date: ISODate
  amount: number
}

export function upcomingRecurring(rules: RecurringRule[], today: ISODate, days = 30): UpcomingRecurring[] {
  const to = new Date(Date.parse(today + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
  const out: UpcomingRecurring[] = []
  for (const r of rules) {
    if (!r.active) continue
    const dates = occurrencesBetween(r.nextDate, r.frequency, r.interval, '0000-01-01', to, {
      endDate: r.endDate,
      anchorDay: r.anchorDay,
      limit: 10,
    })
    for (const d of dates) out.push({ rule: r, date: d, amount: baseAmount(r) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Dates of a rule that are due (<= today) and not yet posted. */
export function dueOccurrences(rule: RecurringRule, today: ISODate): ISODate[] {
  if (!rule.active) return []
  return occurrencesBetween(rule.nextDate, rule.frequency, rule.interval, '0000-01-01', today, {
    endDate: rule.endDate,
    anchorDay: rule.anchorDay,
    limit: 60,
  })
}

export interface YearReport {
  year: number
  months: MonthSummary[]
  income: number
  expenses: number
  net: number
  savingsRate: number | null
  categories: CategoryTotal[]
  avgMonthlyExpense: number
}

export function yearReport(txs: Transaction[], year: number, today: ISODate): YearReport {
  const lastMonth = String(year) === today.slice(0, 4) ? monthKey(today) : `${year}-12`
  const months = monthsBetween(`${year}-01`, lastMonth).map((m) => monthSummary(txs, m))
  const yearTx = txs.filter((t) => t.date.startsWith(String(year)))
  const income = round2(months.reduce((s, m) => s + m.income, 0))
  const expenses = round2(months.reduce((s, m) => s + m.expenses, 0))
  const activeMonths = months.filter((m) => m.count > 0).length || 1
  return {
    year,
    months,
    income,
    expenses,
    net: round2(income - expenses),
    savingsRate: income > 0 ? (income - expenses) / income : null,
    categories: categoryBreakdown(yearTx, 'expense'),
    avgMonthlyExpense: round2(expenses / activeMonths),
  }
}

/** Spending pace: expected spend by today if the budget were spread evenly over the month. */
export function budgetPace(budget: number, today: ISODate): number {
  const end = endOfMonth(today)
  const days = Number(end.slice(8, 10))
  const day = Number(today.slice(8, 10))
  return (budget * day) / days
}

export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return (current - previous) / previous
}
