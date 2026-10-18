export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CAD', 'AUD', 'JPY', 'CHF'] as const

const cache = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, compact: boolean, decimals?: number) {
  const key = `${currency}|${compact}|${decimals}`
  let f = cache.get(key)
  if (!f) {
    const locale = currency === 'INR' ? 'en-IN' : undefined
    try {
      f = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: decimals ?? (compact ? 1 : 2),
        minimumFractionDigits: decimals === 0 ? 0 : undefined,
      })
    } catch {
      f = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
    }
    cache.set(key, f)
  }
  return f
}

export function formatMoney(
  amount: number | null | undefined,
  currency = 'INR',
  opts: { compact?: boolean; decimals?: number; sign?: boolean } = {},
): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  const s = formatter(currency, !!opts.compact, opts.decimals).format(Math.abs(amount))
  if (amount < 0) return '−' + s
  if (opts.sign && amount > 0) return '+' + s
  return s
}

export function formatPct(v: number | null | undefined, opts: { sign?: boolean; decimals?: number } = {}): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const d = opts.decimals ?? 1
  const s = `${Math.abs(v * 100).toFixed(d)}%`
  if (v < 0) return '−' + s
  if (opts.sign && v > 0) return '+' + s
  return s
}

export function formatNumber(v: number | null | undefined, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(v)
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Parses user/CSV amount strings like "₹1,23,456.50", "(1,200)", "-45", "1.234,56" (EU) → number. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[A-Za-z₹$€£¥\s]/g, '')
  if (s.startsWith('-') || s.startsWith('−')) {
    neg = !neg
    s = s.slice(1)
  }
  if (s.endsWith('-')) {
    neg = !neg
    s = s.slice(0, -1)
  }
  // EU style "1.234,56"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  if (!/^\d*\.?\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}
