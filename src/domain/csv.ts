/**
 * CSV helpers: parsing, serialising, column auto-mapping and tolerant date parsing.
 */
import Papa from 'papaparse'
import { isISODate, makeDate, type ISODate } from '@/lib/dates'

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  errors: string[]
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '')
  const res = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  const headers = (res.meta.fields ?? []).filter((h) => h !== '')
  return {
    headers,
    rows: res.data,
    errors: res.errors.slice(0, 10).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  }
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const data = rows.map((r) =>
    cols.map((c) => {
      const v = r[c]
      if (v == null) return ''
      if (Array.isArray(v)) return v.join('; ')
      if (typeof v === 'object') return JSON.stringify(v)
      return String(v)
    }),
  )
  // Guard against CSV formula injection when the file is opened in Excel.
  const safe = data.map((row) => row.map((cell) => (/^[=+\-@\t\r]/.test(cell) && !/^-?\d/.test(cell) ? `'${cell}` : cell)))
  return Papa.unparse({ fields: cols, data: safe })
}

export type DateFormat = 'auto' | 'YMD' | 'DMY' | 'MDY'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

function valid(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += y < 70 ? 2000 : 1900
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const s = makeDate(y, m, d)
  if (!isISODate(s)) return null
  // reject e.g. 2024-02-31
  const back = new Date(s + 'T00:00:00Z')
  if (back.getUTCDate() !== d) return null
  return s
}

/** Parses many common date formats. Ambiguous numeric dates use `format` (auto prefers DMY when unambiguous detection fails). */
export function parseDate(raw: unknown, format: DateFormat = 'auto'): ISODate | null {
  if (raw == null) return null
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Excel serial date
    const ms = Math.round((raw - 25569) * 86400000)
    return new Date(ms).toISOString().slice(0, 10)
  }
  const s = String(raw).trim()
  if (!s) return null
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const y = +m[3]
    if (format === 'MDY') return valid(y, a, b)
    if (format === 'DMY') return valid(y, b, a)
    if (format === 'YMD') return null
    if (a > 12) return valid(y, b, a)
    if (b > 12) return valid(y, a, b)
    return valid(y, b, a) // default to day-first (common in India/EU exports)
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[,\s-]+(\d{2,4})$/)
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)]
    if (mon) return valid(+m[3], mon, +m[1])
  }
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m && MONTHS[m[1].toLowerCase().slice(0, 3)]) return valid(+m[3], MONTHS[m[1].toLowerCase().slice(0, 3)], +m[2])
  return null
}

/** Picks the most likely CSV column for each target field using header synonyms. */
export function autoMap(headers: string[], synonyms: Record<string, string[]>): Record<string, string> {
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')
  const out: Record<string, string> = {}
  const used = new Set<string>()
  for (const [field, syns] of Object.entries(synonyms)) {
    const targets = syns.map(norm)
    const exact = headers.find((h) => !used.has(h) && targets.includes(norm(h)))
    const partial = exact ?? headers.find((h) => !used.has(h) && targets.some((t) => norm(h).includes(t)))
    if (partial) {
      out[field] = partial
      used.add(partial)
    }
  }
  return out
}
