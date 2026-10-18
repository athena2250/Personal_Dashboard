/**
 * XIRR — annualised internal rate of return for irregular cash flows.
 * Cash flows: negative = money invested, positive = money received / current value.
 */
import { diffDays, type ISODate } from '@/lib/dates'

export interface CashFlow {
  date: ISODate
  amount: number
}

export function xirr(flows: CashFlow[], guess = 0.1): number | null {
  const valid = flows.filter((f) => Number.isFinite(f.amount) && f.amount !== 0)
  if (valid.length < 2) return null
  if (!valid.some((f) => f.amount < 0) || !valid.some((f) => f.amount > 0)) return null
  const sorted = [...valid].sort((a, b) => a.date.localeCompare(b.date))
  const t0 = sorted[0].date
  const years = sorted.map((f) => diffDays(f.date, t0) / 365)
  if (years[years.length - 1] < 1 / 365) return null

  const npv = (r: number) => sorted.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0)
  const dnpv = (r: number) => sorted.reduce((s, f, i) => s - (years[i] * f.amount) / Math.pow(1 + r, years[i] + 1), 0)

  // Newton-Raphson
  let r = guess
  for (let i = 0; i < 100; i++) {
    const f = npv(r)
    const d = dnpv(r)
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break
    const next = r - f / d
    if (next <= -0.9999) break
    if (Math.abs(next - r) < 1e-9) return next
    r = next
  }
  // Bisection fallback
  let lo = -0.9999
  let hi = 10
  let flo = npv(lo)
  const fhi = npv(hi)
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    const fm = npv(mid)
    if (Math.abs(fm) < 1e-7) return mid
    if (fm * flo < 0) hi = mid
    else {
      lo = mid
      flo = fm
    }
  }
  return (lo + hi) / 2
}
