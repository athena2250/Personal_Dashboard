import { db } from '../db'
import type { Investment, InvestmentTxn, Valuation } from '../models'
import { tracked } from '../saveStatus'
import { investmentSchema, invTxnSchema, validate, valuationSchema } from '../schemas'
import { addDays, addMonths, type ISODate } from '@/lib/dates'
import { compact, stamp, touch, type NewRow } from './base'

export type InvestmentInput = NewRow<Investment>

/**
 * Creates an investment. When `initialAmount` is given (FD principal, opening balance, lump sum),
 * it is recorded as a contribution on the start date — never as profit.
 */
export async function addInvestment(input: InvestmentInput, initialAmount?: number) {
  validate(investmentSchema, input)
  return tracked(() =>
    db.transaction('rw', [db.investments, db.invTxns], async () => {
      const row = stamp<Investment>(compact({ ...input, name: input.name.trim(), links: input.links ?? [] }))
      await db.investments.add(row)
      if (initialAmount && initialAmount > 0) {
        await db.invTxns.add(
          stamp<InvestmentTxn>({
            investmentId: row.id,
            date: input.startDate,
            type: 'contribution',
            amount: initialAmount,
            source: 'manual',
            notes: input.assetType === 'fd' ? 'Principal' : 'Opening amount',
            demo: input.demo,
          }),
        )
      }
      return row
    }),
  )
}

export async function updateInvestment(id: string, patch: Partial<InvestmentInput>) {
  validate(investmentSchema.partial(), patch)
  return tracked(() => db.investments.update(id, touch(patch)))
}

export function deleteInvestment(id: string) {
  return tracked(() =>
    db.transaction('rw', [db.investments, db.invTxns, db.valuations], async () => {
      await db.invTxns.where('investmentId').equals(id).delete()
      await db.valuations.where('investmentId').equals(id).delete()
      await db.investments.delete(id)
    }),
  )
}

export async function addInvTxn(input: NewRow<InvestmentTxn>) {
  validate(invTxnSchema, input)
  return tracked(async () => {
    const row = stamp<InvestmentTxn>(compact(input))
    await db.invTxns.add(row)
    return row
  })
}

export async function updateInvTxn(id: string, patch: Partial<NewRow<InvestmentTxn>>) {
  validate(invTxnSchema.partial(), patch)
  return tracked(() => db.invTxns.update(id, touch(patch)))
}

export function deleteInvTxn(id: string) {
  return tracked(() => db.invTxns.delete(id))
}

export async function addValuation(input: NewRow<Valuation>) {
  validate(valuationSchema, input)
  return tracked(async () => {
    const row = stamp<Valuation>(compact(input))
    await db.valuations.add(row)
    return row
  })
}

export function deleteValuation(id: string) {
  return tracked(() => db.valuations.delete(id))
}

export function nextSipDate(date: ISODate, frequency: 'monthly' | 'quarterly' | 'weekly', dayOfMonth?: number): ISODate {
  if (frequency === 'weekly') return addDays(date, 7)
  return addMonths(date, frequency === 'quarterly' ? 3 : 1, dayOfMonth)
}

/** Records the next SIP installment as a contribution and advances the next installment date. */
export async function recordSipInstallment(inv: Investment, opts: { date?: ISODate; amount?: number; units?: number; nav?: number } = {}) {
  const sip = inv.sip
  if (!sip) throw new Error('This investment has no SIP plan')
  const date = opts.date ?? sip.nextDate
  const amount = opts.amount ?? sip.amount
  validate(invTxnSchema, { investmentId: inv.id, date, type: 'contribution', amount, units: opts.units })
  return tracked(() =>
    db.transaction('rw', [db.investments, db.invTxns], async () => {
      await db.invTxns.add(
        stamp<InvestmentTxn>(compact({ investmentId: inv.id, date, type: 'contribution', amount, units: opts.units, nav: opts.nav, source: 'sip', notes: 'SIP installment', demo: inv.demo })),
      )
      let next = sip.nextDate
      while (next <= date) next = nextSipDate(next, sip.frequency, sip.dayOfMonth)
      await db.investments.update(inv.id, touch({ sip: { ...sip, nextDate: next } }))
    }),
  )
}

export interface InvImportRow {
  investmentName: string
  date: ISODate
  type: InvestmentTxn['type'] | 'valuation'
  amount: number
  units?: number
  nav?: number
  notes?: string
}

/**
 * Imports contributions / valuations from a CSV export (e.g. a copy of a SIP spreadsheet).
 * Rows are matched to investments by name; unknown names create new "other" holdings only if
 * `createMissing` is set. Exact duplicates (same investment, date, type, amount) are skipped.
 */
export function importInvestmentRows(rows: InvImportRow[], opts: { createMissing: boolean; assetType: Investment['assetType']; provider: string; currency: string }) {
  return tracked(() =>
    db.transaction('rw', [db.investments, db.invTxns, db.valuations], async () => {
      const invs = await db.investments.toArray()
      const byName = new Map(invs.map((i) => [i.name.trim().toLowerCase(), i]))
      const txns = await db.invTxns.toArray()
      const vals = await db.valuations.toArray()
      const txKeys = new Set(txns.map((t) => `${t.investmentId}|${t.date}|${t.type}|${Math.round(t.amount * 100)}`))
      const valKeys = new Set(vals.map((v) => `${v.investmentId}|${v.date}|${Math.round(v.value * 100)}`))
      let added = 0
      let skipped = 0
      const created: string[] = []
      const unmatched = new Set<string>()
      for (const r of rows) {
        const key = r.investmentName.trim().toLowerCase()
        let inv = byName.get(key)
        if (!inv) {
          if (!opts.createMissing) {
            unmatched.add(r.investmentName)
            skipped++
            continue
          }
          inv = stamp<Investment>({
            name: r.investmentName.trim(),
            provider: opts.provider,
            assetType: opts.assetType,
            currency: opts.currency,
            startDate: r.date,
            isLiability: false,
            links: [],
            archived: false,
          })
          await db.investments.add(inv)
          byName.set(key, inv)
          created.push(inv.name)
        }
        if (r.type === 'valuation') {
          const k = `${inv.id}|${r.date}|${Math.round(r.amount * 100)}`
          if (valKeys.has(k)) {
            skipped++
            continue
          }
          valKeys.add(k)
          await db.valuations.add(stamp<Valuation>(compact({ investmentId: inv.id, date: r.date, value: r.amount, source: 'actual' as const, notes: r.notes ?? 'Imported' })))
        } else {
          const k = `${inv.id}|${r.date}|${r.type}|${Math.round(r.amount * 100)}`
          if (txKeys.has(k)) {
            skipped++
            continue
          }
          txKeys.add(k)
          await db.invTxns.add(stamp<InvestmentTxn>(compact({ investmentId: inv.id, date: r.date, type: r.type, amount: r.amount, units: r.units, nav: r.nav, notes: r.notes, source: 'import' as const })))
        }
        added++
      }
      return { added, skipped, created, unmatched: [...unmatched] }
    }),
  )
}

