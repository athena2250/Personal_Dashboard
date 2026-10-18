import { useMemo, useState } from 'react'
import { FileUp } from 'lucide-react'
import type { TxType } from '@/data/models'
import { importTransactions, undoImport, type TxInput } from '@/data/repos/spending'
import { autoMap, parseCsv, parseDate, type DateFormat, type ParsedCsv } from '@/domain/csv'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LabeledSelect } from '@/components/ui/forms'
import { useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { parseAmount } from '@/lib/money'
import { formatDate } from '@/lib/dates'

type AmountMode = 'signed' | 'debitCredit' | 'typeColumn' | 'allExpense' | 'allIncome'

const SYNONYMS = {
  date: ['date', 'txndate', 'transactiondate', 'valuedate', 'posteddate', 'postingdate'],
  merchant: ['merchant', 'description', 'narration', 'payee', 'details', 'particulars', 'name', 'remarks'],
  amount: ['amount', 'amt', 'value', 'transactionamount'],
  debit: ['debit', 'withdrawal', 'withdrawalamt', 'dr', 'debitamount'],
  credit: ['credit', 'deposit', 'depositamt', 'cr', 'creditamount'],
  type: ['type', 'drcr', 'transactiontype', 'kind'],
  category: ['category'],
  subcategory: ['subcategory'],
  paymentMethod: ['paymentmethod', 'method', 'mode', 'account'],
  notes: ['notes', 'note', 'memo'],
  currency: ['currency', 'ccy'],
}

export function ImportTransactionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Import transactions from CSV" description="Works with CSV exports from banks, Excel/Google Sheets, or other apps. Nothing is saved until you confirm." size="xl">
      {open && <ImportFlow onDone={onClose} />}
    </Modal>
  )
}

function ImportFlow({ onDone }: { onDone: () => void }) {
  const { settings } = useApp()
  const toast = useToast()
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [fileName, setFileName] = useState('')
  const [map, setMap] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<AmountMode>('signed')
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto')
  const [defaultCategory, setDefaultCategory] = useState('Other')
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (!parsed.headers.length) throw new Error('No header row found in this file.')
      setCsv(parsed)
      setFileName(file.name)
      const m = autoMap(parsed.headers, SYNONYMS)
      setMap(m)
      setMode(m.debit || m.credit ? 'debitCredit' : m.type ? 'typeColumn' : 'signed')
    } catch (e) {
      toast.error(e)
    }
  }

  const rows = useMemo(() => {
    if (!csv) return { ok: [] as TxInput[], errors: [] as string[] }
    const ok: TxInput[] = []
    const errors: string[] = []
    csv.rows.forEach((r, i) => {
      const line = i + 2
      const date = parseDate(r[map.date], dateFormat)
      if (!date) return errors.push(`Row ${line}: unreadable date “${r[map.date] ?? ''}”`)
      let amount: number | null = null
      let type: TxType = 'expense'
      if (mode === 'debitCredit') {
        const d = parseAmount(r[map.debit])
        const c = parseAmount(r[map.credit])
        if (d && Math.abs(d) > 0) {
          amount = Math.abs(d)
          type = 'expense'
        } else if (c && Math.abs(c) > 0) {
          amount = Math.abs(c)
          type = 'income'
        }
      } else {
        const a = parseAmount(r[map.amount])
        if (a != null) {
          amount = Math.abs(a)
          if (mode === 'signed') type = a < 0 ? 'expense' : 'income'
          else if (mode === 'allIncome') type = 'income'
          else if (mode === 'typeColumn') type = /^(cr|credit|income|in|deposit)/i.test(r[map.type] ?? '') ? 'income' : 'expense'
        }
      }
      if (!amount) return errors.push(`Row ${line}: missing or zero amount`)
      const merchant = (r[map.merchant] ?? '').trim() || '(no description)'
      const currency = (map.currency && r[map.currency]?.trim().toUpperCase()) || settings.baseCurrency
      ok.push({
        date,
        type,
        amount,
        currency: /^[A-Z]{3}$/.test(currency) ? currency : settings.baseCurrency,
        fxRate: 1,
        category: (map.category && r[map.category]?.trim()) || (type === 'income' ? 'Other income' : defaultCategory),
        subcategory: (map.subcategory && r[map.subcategory]?.trim()) || undefined,
        merchant: merchant.slice(0, 200),
        paymentMethod: (map.paymentMethod && r[map.paymentMethod]?.trim()) || undefined,
        notes: (map.notes && r[map.notes]?.trim()) || undefined,
        tags: ['imported'],
      })
    })
    return { ok, errors }
  }, [csv, map, mode, dateFormat, defaultCategory, settings.baseCurrency])

  const foreign = rows.ok.filter((r) => r.currency !== settings.baseCurrency).length

  const doImport = async () => {
    setBusy(true)
    try {
      const res = await importTransactions(rows.ok)
      toast.success(`Imported ${res.added} transaction${res.added === 1 ? '' : 's'}${res.skipped ? `, skipped ${res.skipped} duplicate${res.skipped === 1 ? '' : 's'}` : ''}${res.newCategories.length ? `. New categories: ${res.newCategories.join(', ')}` : ''}`, res.added ? { label: 'Undo', onClick: () => undoImport(res.batch).then(() => toast.info('Import undone')).catch(toast.error) } : undefined)
      onDone()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  const col = (key: string, label: string, required = false) => (
    <LabeledSelect label={label} required={required} value={map[key] ?? ''} onChange={(e) => setMap({ ...map, [key]: e.target.value })}>
      <option value="">{required ? 'Choose column…' : '— none —'}</option>
      {csv?.headers.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </LabeledSelect>
  )

  if (!csv)
    return (
      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line-strong px-6 py-14 text-center hover:border-[var(--spending)]">
        <FileUp className="h-8 w-8 text-muted" />
        <span className="text-sm text-fg">Choose a .csv file</span>
        <span className="text-xs text-muted">Needs a header row. Columns are matched automatically and you can adjust them.</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
    )

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-2">
        <strong className="text-fg">{fileName}</strong> — {csv.rows.length} rows, {csv.headers.length} columns.{' '}
        <button className="text-accent hover:underline" onClick={() => setCsv(null)}>
          Choose another file
        </button>
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {col('date', 'Date', true)}
        <LabeledSelect label="Date format" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
          <option value="auto">Auto-detect (day-first if ambiguous)</option>
          <option value="DMY">DD/MM/YYYY</option>
          <option value="MDY">MM/DD/YYYY</option>
          <option value="YMD">YYYY-MM-DD</option>
        </LabeledSelect>
        {col('merchant', 'Description / merchant', true)}
        <LabeledSelect label="Amounts" value={mode} onChange={(e) => setMode(e.target.value as AmountMode)}>
          <option value="signed">One column: negative = expense</option>
          <option value="debitCredit">Separate debit & credit columns</option>
          <option value="typeColumn">Amount + type column (Dr/Cr)</option>
          <option value="allExpense">All rows are expenses</option>
          <option value="allIncome">All rows are income</option>
        </LabeledSelect>
        {mode === 'debitCredit' ? (
          <>
            {col('debit', 'Debit (expense) column', true)}
            {col('credit', 'Credit (income) column')}
          </>
        ) : (
          <>
            {col('amount', 'Amount', true)}
            {mode === 'typeColumn' && col('type', 'Type column', true)}
          </>
        )}
        {col('category', 'Category')}
        {!map.category && <LabeledSelect label="Default expense category" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}>{['Other', 'Food & Dining', 'Shopping', 'Transport', 'Utilities'].map((c) => <option key={c}>{c}</option>)}</LabeledSelect>}
        {col('subcategory', 'Subcategory')}
        {col('paymentMethod', 'Payment method')}
        {col('notes', 'Notes')}
        {col('currency', 'Currency')}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-fg-2">
          Preview — {rows.ok.length} ready{rows.errors.length ? `, ${rows.errors.length} will be skipped` : ''}
        </p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.ok.slice(0, 6).map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-fg-2">{formatDate(r.date)}</td>
                  <td className="px-3 py-1.5 text-fg">{r.merchant}</td>
                  <td className="px-3 py-1.5 text-fg-2">{r.category}</td>
                  <td className="px-3 py-1.5">{r.type}</td>
                  <td className="tabular px-3 py-1.5 text-right">
                    {r.amount} {r.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.errors.length > 0 && (
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">Show skipped rows</summary>
            <ul className="mt-1 max-h-32 overflow-y-auto">
              {rows.errors.slice(0, 50).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        )}
        {foreign > 0 && <p className="mt-2 text-xs text-warn">{foreign} row(s) are in another currency and will be imported at exchange rate 1 — edit them afterwards to set the actual rate.</p>}
        <p className="mt-2 text-xs text-muted">Duplicates (same date, type, amount and description as an existing transaction) are skipped automatically.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} disabled={!rows.ok.length} onClick={doImport}>
          Import {rows.ok.length} transaction{rows.ok.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  )
}
