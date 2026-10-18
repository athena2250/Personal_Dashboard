/**
 * Recurrence for recurring transactions and SIP installments.
 */
import type { Frequency } from '@/data/models'
import { addDays, addMonths, type ISODate } from '@/lib/dates'

export function nextOccurrence(date: ISODate, frequency: Frequency, interval = 1, anchorDay?: number): ISODate {
  const n = Math.max(1, Math.floor(interval))
  switch (frequency) {
    case 'weekly':
      return addDays(date, 7 * n)
    case 'monthly':
      return addMonths(date, n, anchorDay)
    case 'quarterly':
      return addMonths(date, 3 * n, anchorDay)
    case 'yearly':
      return addMonths(date, 12 * n, anchorDay)
  }
}

/** All occurrences from `start` (inclusive) that fall in [from, to], capped at `limit`. */
export function occurrencesBetween(
  start: ISODate,
  frequency: Frequency,
  interval: number,
  from: ISODate,
  to: ISODate,
  opts: { endDate?: ISODate; anchorDay?: number; limit?: number } = {},
): ISODate[] {
  const out: ISODate[] = []
  const limit = opts.limit ?? 500
  const anchor = opts.anchorDay ?? Number(start.slice(8, 10))
  let d = start
  let guard = 0
  while (d <= to && guard++ < 5000) {
    if (opts.endDate && d > opts.endDate) break
    if (d >= from) {
      out.push(d)
      if (out.length >= limit) break
    }
    d = nextOccurrence(d, frequency, interval, anchor)
  }
  return out
}

/** Approximate monthly equivalent of a recurring amount (for budgeting summaries). */
export function monthlyEquivalent(amount: number, frequency: Frequency, interval = 1): number {
  const n = Math.max(1, interval)
  switch (frequency) {
    case 'weekly':
      return (amount * 52) / 12 / n
    case 'monthly':
      return amount / n
    case 'quarterly':
      return amount / 3 / n
    case 'yearly':
      return amount / 12 / n
  }
}
