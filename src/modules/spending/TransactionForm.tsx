import { useState } from 'react'
import type { Frequency, Transaction, TxType } from '@/data/models'
import { addTransaction, addRecurring, updateTransaction } from '@/data/repos/spending'
import { useCategories } from '@/data/hooks'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, LabeledInput, LabeledSelect, LabeledTextarea, Select } from '@/components/ui/forms'
import { Segmented } from '@/components/ui/display'
import { useSubmit } from '@/components/useSubmit'
import { useApp } from '@/app/AppContext'
import { CURRENCIES } from '@/lib/money'
import { nextOccurrence } from '@/domain/recurrence'

export function TransactionFormModal({ open, onClose, tx, presetType }: { open: boolean; onClose: () => void; tx?: Transaction; presetType?: TxType }) {
  return (
    <Modal open={open} onClose={onClose} title={tx ? 'Edit transaction' : 'Add transaction'} size="md">
      {open && <TransactionForm tx={tx} presetType={presetType} onDone={onClose} />}
    </Modal>
  )
}

function TransactionForm({ tx, presetType, onDone }: { tx?: Transaction; presetType?: TxType; onDone: () => void }) {
  const { today, settings } = useApp()
  const categories = useCategories()
  const [type, setType] = useState<TxType>(tx?.type ?? presetType ?? 'expense')
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '')
  const [currency, setCurrency] = useState(tx?.currency ?? settings.baseCurrency)
  const [fxRate, setFxRate] = useState(tx ? String(tx.fxRate) : '1')
  const [date, setDate] = useState(tx?.date ?? today)
  const [category, setCategory] = useState(tx?.category ?? '')
  const [subcategory, setSubcategory] = useState(tx?.subcategory ?? '')
  const [merchant, setMerchant] = useState(tx?.merchant ?? '')
  const [paymentMethod, setPaymentMethod] = useState(tx?.paymentMethod ?? '')
  const [tags, setTags] = useState((tx?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(tx?.notes ?? '')
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [autoPost, setAutoPost] = useState(false)
  const { busy, errors, run } = useSubmit()

  const cats = (categories ?? []).filter((c) => c.type === type && (!c.archived || c.name === category))
  const selected = cats.find((c) => c.name === category)
  const foreign = currency !== settings.baseCurrency

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      type,
      amount: Number(amount),
      currency,
      fxRate: foreign ? Number(fxRate) : 1,
      date,
      category: category || cats[0]?.name || '',
      subcategory: subcategory || undefined,
      merchant,
      paymentMethod: paymentMethod || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes || undefined,
    }
    const ok = await run(async () => {
      if (tx) return updateTransaction(tx.id, data)
      if (recurring) {
        // Record this one now and schedule the rest.
        const rule = await addRecurring({
          ...data,
          frequency,
          interval: 1,
          startDate: date,
          nextDate: nextOccurrence(date, frequency, 1, Number(date.slice(8, 10))),
          autoPost,
          active: true,
        })
        return addTransaction({ ...data, recurringId: rule.id })
      }
      return addTransaction(data)
    }, tx ? 'Transaction updated' : recurring ? 'Transaction added and recurring schedule created' : `${type === 'income' ? 'Income' : 'Expense'} added`)
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented
        value={type}
        onChange={(v) => {
          setType(v)
          setCategory('')
          setSubcategory('')
        }}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Amount" required error={errors.amount}>
          <Input type="number" step="0.01" min="0" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} placeholder="0.00" className="text-base font-semibold" />
        </Field>
        <Field label="Currency" error={errors.currency}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-24">
            {[...new Set([settings.baseCurrency, ...CURRENCIES, currency])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      {foreign && (
        <LabeledInput
          label={`Exchange rate (1 ${currency} = ? ${settings.baseCurrency})`}
          type="number"
          step="any"
          min="0"
          value={fxRate}
          onChange={(e) => setFxRate(e.target.value)}
          error={errors.fxRate}
          hint={amount && Number(fxRate) > 0 ? `≈ ${(Number(amount) * Number(fxRate)).toFixed(2)} ${settings.baseCurrency} in reports. Enter the rate you actually paid; no live rates are fetched.` : 'No live rates are fetched — enter the rate you paid.'}
        />
      )}
      <LabeledInput label={type === 'income' ? 'Source / description' : 'Merchant / description'} required value={merchant} onChange={(e) => setMerchant(e.target.value)} error={errors.merchant} placeholder={type === 'income' ? 'e.g. Salary' : 'e.g. Swiggy, Uber, Amazon'} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabeledInput label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <LabeledSelect label="Category" required value={category || cats[0]?.name || ''} onChange={(e) => { setCategory(e.target.value); setSubcategory('') }} error={errors.category}>
          {cats.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </LabeledSelect>
        {(selected ?? cats[0])?.subcategories.length ? (
          <LabeledSelect label="Subcategory" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
            <option value="">—</option>
            {(selected ?? cats[0]).subcategories.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </LabeledSelect>
        ) : null}
        <LabeledSelect label="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="">—</option>
          {[...new Set([...settings.paymentMethods, ...(paymentMethod ? [paymentMethod] : [])])].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </LabeledSelect>
      </div>
      <LabeledInput label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma separated, e.g. trip, work" />
      <LabeledTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="[&_textarea]:min-h-[60px]" />
      {!tx && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-3">
          <Checkbox label="This repeats (create a recurring schedule)" checked={recurring} onChange={setRecurring} />
          {recurring && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledSelect label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </LabeledSelect>
              <div className="flex items-end pb-2">
                <Checkbox label="Auto-record when due" checked={autoPost} onChange={setAutoPost} />
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {tx ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
