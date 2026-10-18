import { db } from '../db'
import { TOTAL_BUDGET, type Budget, type Category, type RecurringRule, type Transaction } from '../models'
import { tracked } from '../saveStatus'
import { budgetSchema, recurringSchema, transactionSchema, validate } from '../schemas'
import { dueOccurrences } from '@/domain/spending'
import { nextOccurrence } from '@/domain/recurrence'
import { uid } from '@/lib/util'
import { compact, stamp, touch, type NewRow } from './base'

/* ───────────── Transactions ───────────── */

export type TxInput = NewRow<Transaction>

function cleanTx<T extends Partial<TxInput>>(t: T): T {
  return compact({
    ...t,
    merchant: t.merchant?.trim(),
    tags: t.tags?.map((x) => x.trim()).filter(Boolean),
  })
}

export async function addTransaction(input: TxInput) {
  validate(transactionSchema, input)
  return tracked(async () => {
    const row = stamp<Transaction>(cleanTx({ ...input, tags: input.tags ?? [] }))
    await db.transactions.add(row)
    return row
  })
}

export async function updateTransaction(id: string, patch: Partial<TxInput>) {
  validate(transactionSchema.partial(), patch)
  return tracked(() => db.transactions.update(id, touch(cleanTx(patch))))
}

export function deleteTransaction(id: string) {
  return tracked(() => db.transactions.delete(id))
}

export function deleteTransactions(ids: string[]) {
  return tracked(() => db.transactions.bulkDelete(ids))
}

/**
 * Imports transactions, skipping rows that duplicate an existing transaction
 * (same date, type, amount, and merchant). Returns counts.
 */
export function importTransactions(rows: TxInput[]) {
  return tracked(async () => {
    const batch = uid()
    const existing = await db.transactions.toArray()
    const key = (t: Pick<Transaction, 'date' | 'type' | 'amount' | 'merchant'>) =>
      `${t.date}|${t.type}|${Math.round(t.amount * 100)}|${t.merchant.trim().toLowerCase()}`
    const seen = new Set(existing.map(key))
    const toAdd: Transaction[] = []
    let skipped = 0
    for (const r of rows) {
      const k = key(r)
      if (seen.has(k)) {
        skipped++
        continue
      }
      seen.add(k)
      toAdd.push(stamp<Transaction>(cleanTx({ ...r, tags: r.tags ?? [], importBatch: batch })))
    }
    // Ensure every imported category exists.
    const cats = await db.categories.toArray()
    const known = new Set(cats.map((c) => `${c.type}|${c.name.toLowerCase()}`))
    const newCats: Category[] = []
    for (const t of toAdd) {
      const k = `${t.type}|${t.category.toLowerCase()}`
      if (!known.has(k)) {
        known.add(k)
        newCats.push(stamp<Category>({ name: t.category, type: t.type, color: '#64748b', subcategories: [], archived: false }))
      }
    }
    await db.transaction('rw', [db.transactions, db.categories], async () => {
      if (newCats.length) await db.categories.bulkAdd(newCats)
      await db.transactions.bulkAdd(toAdd)
    })
    return { added: toAdd.length, skipped, newCategories: newCats.map((c) => c.name), batch }
  })
}

export function undoImport(batch: string) {
  return tracked(() => db.transactions.where('importBatch').equals(batch).delete())
}

/* ───────────── Categories ───────────── */

export function addCategory(input: Pick<Category, 'name' | 'type' | 'color'> & { subcategories?: string[] }) {
  return tracked(async () => {
    const name = input.name.trim()
    if (!name) throw new Error('Category name is required')
    const dup = await db.categories.filter((c) => c.type === input.type && c.name.toLowerCase() === name.toLowerCase()).first()
    if (dup) throw new Error(`A ${input.type} category named "${name}" already exists`)
    const row = stamp<Category>({ ...input, name, subcategories: input.subcategories ?? [], archived: false })
    await db.categories.add(row)
    return row
  })
}

/** Updates a category. Renaming cascades to transactions, budgets and recurring rules. */
export function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'color' | 'subcategories' | 'archived'>>) {
  return tracked(() =>
    db.transaction('rw', [db.categories, db.transactions, db.budgets, db.recurring], async () => {
      const cat = await db.categories.get(id)
      if (!cat) throw new Error('Category not found')
      const newName = patch.name?.trim()
      if (newName !== undefined && !newName) throw new Error('Category name is required')
      if (newName && newName !== cat.name) {
        const dup = await db.categories.filter((c) => c.id !== id && c.type === cat.type && c.name.toLowerCase() === newName.toLowerCase()).first()
        if (dup) throw new Error(`A category named "${newName}" already exists`)
        await db.transactions.where('category').equals(cat.name).modify((t) => {
          if (t.type === cat.type) t.category = newName
        })
        await db.budgets.where('category').equals(cat.name).modify({ category: newName })
        await db.recurring.filter((r) => r.category === cat.name && r.type === cat.type).modify({ category: newName })
      }
      await db.categories.update(id, touch({ ...patch, name: newName ?? cat.name }))
    }),
  )
}

export function deleteCategory(id: string) {
  return tracked(async () => {
    const cat = await db.categories.get(id)
    if (!cat) return
    const used = await db.transactions.where('category').equals(cat.name).filter((t) => t.type === cat.type).count()
    if (used > 0) throw new Error(`"${cat.name}" is used by ${used} transaction(s). Archive it instead, or re-categorise them first.`)
    await db.budgets.where('category').equals(cat.name).delete()
    await db.categories.delete(id)
  })
}

/* ───────────── Budgets ───────────── */

/** Creates or replaces the budget for (category, month). month '*' = every month. */
export async function setBudget(category: string, month: string, amount: number) {
  validate(budgetSchema, { category, month, amount })
  return tracked(async () => {
    const existing = await db.budgets.where('category').equals(category).filter((b) => b.month === month).first()
    if (existing) await db.budgets.update(existing.id, touch({ amount }))
    else await db.budgets.add(stamp<Budget>({ category, month, amount }))
  })
}

export function deleteBudget(id: string) {
  return tracked(() => db.budgets.delete(id))
}

export { TOTAL_BUDGET }

/* ───────────── Recurring ───────────── */

export type RecurringInput = Omit<NewRow<RecurringRule>, 'nextDate'> & { nextDate?: string }

export async function addRecurring(input: RecurringInput) {
  validate(recurringSchema, input)
  return tracked(async () => {
    const row = stamp<RecurringRule>(
      compact({ ...input, nextDate: input.nextDate ?? input.startDate, anchorDay: Number(input.startDate.slice(8, 10)), tags: input.tags ?? [] }),
    )
    await db.recurring.add(row)
    return row
  })
}

export async function updateRecurring(id: string, patch: Partial<RecurringInput>) {
  validate(recurringSchema.partial(), patch)
  return tracked(() => db.recurring.update(id, touch(compact(patch))))
}

export function deleteRecurring(id: string) {
  return tracked(() =>
    db.transaction('rw', [db.recurring, db.transactions], async () => {
      await db.transactions.where('recurringId').equals(id).modify({ recurringId: undefined })
      await db.recurring.delete(id)
    }),
  )
}

function txFromRule(rule: RecurringRule, date: string, demo?: boolean): Transaction {
  return stamp<Transaction>(
    compact({
      date,
      type: rule.type,
      amount: rule.amount,
      currency: rule.currency,
      fxRate: rule.fxRate,
      category: rule.category,
      subcategory: rule.subcategory,
      merchant: rule.merchant,
      paymentMethod: rule.paymentMethod,
      notes: rule.notes,
      tags: rule.tags,
      recurringId: rule.id,
      demo,
    }),
  )
}

/** Records the next occurrence of a rule as a transaction and advances the rule. */
export function postRecurring(rule: RecurringRule) {
  return tracked(() =>
    db.transaction('rw', [db.recurring, db.transactions], async () => {
      const tx = txFromRule(rule, rule.nextDate, rule.demo)
      await db.transactions.add(tx)
      await db.recurring.update(rule.id, touch({ nextDate: nextOccurrence(rule.nextDate, rule.frequency, rule.interval, rule.anchorDay) }))
      return tx
    }),
  )
}

/** Skips the next occurrence without recording a transaction. */
export function skipRecurring(rule: RecurringRule) {
  return tracked(() => db.recurring.update(rule.id, touch({ nextDate: nextOccurrence(rule.nextDate, rule.frequency, rule.interval, rule.anchorDay) })))
}

/** Posts all due occurrences for rules with autoPost enabled. Returns number posted. */
export async function processAutoPost(today: string): Promise<number> {
  const rules = await db.recurring.filter((r) => r.active && r.autoPost && r.nextDate <= today).toArray()
  if (!rules.length) return 0
  return tracked(() =>
    db.transaction('rw', [db.recurring, db.transactions], async () => {
      let posted = 0
      for (const rule of rules) {
        const dates = dueOccurrences(rule, today)
        if (!dates.length) continue
        await db.transactions.bulkAdd(dates.map((d) => txFromRule(rule, d, rule.demo)))
        posted += dates.length
        const last = dates[dates.length - 1]
        await db.recurring.update(rule.id, touch({ nextDate: nextOccurrence(last, rule.frequency, rule.interval, rule.anchorDay) }))
      }
      return posted
    }),
  )
}
