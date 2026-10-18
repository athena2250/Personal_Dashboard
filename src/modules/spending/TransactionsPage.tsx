import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Download, Pencil, Plus, Repeat, Search, Trash2, Upload, Receipt } from 'lucide-react'
import type { Transaction } from '@/data/models'
import { useCategories, useTransactions } from '@/data/hooks'
import { deleteTransaction, deleteTransactions } from '@/data/repos/spending'
import { baseAmount } from '@/domain/spending'
import { toCsv } from '@/domain/csv'
import { Button } from '@/components/ui/Button'
import { Badge, Card, EmptyState, Loading } from '@/components/ui/display'
import { Input, Select } from '@/components/ui/forms'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { useQuickAdd } from '@/app/QuickAdd'
import { formatDate, monthKey, formatMonth } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn, downloadFile } from '@/lib/util'
import { TransactionFormModal } from './TransactionForm'
import { ImportTransactionsModal } from './ImportTransactions'

type Sort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

export function TransactionsPage() {
  const { money, settings } = useApp()
  const txs = useTransactions()
  const categories = useCategories()
  const [params, setParams] = useSearchParams()
  const confirm = useConfirm()
  const toast = useToast()
  const quick = useQuickAdd()
  const q = params.get('q') ?? ''
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [month, setMonth] = useState('')
  const [method, setMethod] = useState('')
  const [sort, setSort] = useState<Sort>('date-desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Transaction | undefined>()
  const [importing, setImporting] = useState(false)
  const [limit, setLimit] = useState(100)

  const months = useMemo(() => [...new Set((txs ?? []).map((t) => monthKey(t.date)))].sort().reverse(), [txs])
  const methods = useMemo(() => [...new Set((txs ?? []).map((t) => t.paymentMethod).filter(Boolean) as string[])].sort(), [txs])

  const filtered = useMemo(() => {
    if (!txs) return []
    const s = q.trim().toLowerCase()
    const list = txs.filter(
      (t) =>
        (!type || t.type === type) &&
        (!category || t.category === category) &&
        (!month || t.date.startsWith(month)) &&
        (!method || t.paymentMethod === method) &&
        (!s || [t.merchant, t.category, t.subcategory, t.notes, t.paymentMethod, ...(t.tags ?? [])].join(' ').toLowerCase().includes(s)),
    )
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.date.localeCompare(b.date)
        case 'amount-desc':
          return baseAmount(b) - baseAmount(a)
        case 'amount-asc':
          return baseAmount(a) - baseAmount(b)
        default:
          return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      }
    })
  }, [txs, q, type, category, month, method, sort])

  if (!txs || !categories) return <Loading />

  const totalIn = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + baseAmount(t), 0)
  const totalOut = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + baseAmount(t), 0)
  const allSelected = filtered.length > 0 && filtered.slice(0, limit).every((t) => selected.has(t.id))

  const exportCsv = () => {
    const rows = filtered.map((t) => ({
      date: t.date,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      fxRate: t.fxRate,
      [`amount_${settings.baseCurrency}`]: baseAmount(t),
      category: t.category,
      subcategory: t.subcategory ?? '',
      merchant: t.merchant,
      paymentMethod: t.paymentMethod ?? '',
      tags: (t.tags ?? []).join('; '),
      notes: t.notes ?? '',
      recurring: t.recurringId ? 'yes' : '',
    }))
    downloadFile(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv')
  }

  const bulkDelete = async () => {
    const ids = [...selected]
    if (!(await confirm({ title: `Delete ${ids.length} transaction${ids.length === 1 ? '' : 's'}?`, message: 'This cannot be undone. Export a CSV first if you want a copy.', confirmLabel: 'Delete', danger: true }))) return
    deleteTransactions(ids)
      .then(() => {
        toast.success(`Deleted ${ids.length} transaction${ids.length === 1 ? '' : 's'}`)
        setSelected(new Set())
      })
      .catch(toast.error)
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted">
            {filtered.length} transactions · <span className="text-good-fg">in {money(totalIn, { decimals: 0 })}</span> · <span className="text-spending">out {money(totalOut, { decimals: 0 })}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 && (
              <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={bulkDelete}>
                Delete {selected.size}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => setImporting(true)}>
              Import CSV
            </Button>
            <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv} disabled={!filtered.length}>
              Export CSV
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => quick('expense')}>
              Add
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted" />
            <Input value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} placeholder="Search merchant, notes, tags…" className="pl-9" aria-label="Search transactions" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto" aria-label="Type">
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto" aria-label="Category">
            <option value="">All categories</option>
            {[...new Set(categories.map((c) => c.name))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" aria-label="Month">
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </Select>
          {methods.length > 0 && (
            <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-auto" aria-label="Payment method">
              <option value="">All methods</option>
              {methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          )}
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto" aria-label="Sort">
            <option value="date-desc">Newest</option>
            <option value="date-asc">Oldest</option>
            <option value="amount-desc">Largest</option>
            <option value="amount-asc">Smallest</option>
          </Select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<Receipt className="h-5 w-5" />} title={txs.length ? 'No transactions match' : 'No transactions yet'} description={txs.length ? 'Adjust the filters above.' : 'Add your first expense or import a CSV.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? new Set(filtered.slice(0, limit).map((t) => t.id)) : new Set())}
                    className="accent-[var(--accent)]"
                  />
                </th>
                <th className="px-2 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium">Method</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.slice(0, limit).map((t) => (
                <tr key={t.id} className={cn('group hover:bg-surface-2/40', selected.has(t.id) && 'bg-accent-soft')}>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.merchant}`}
                      checked={selected.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(selected)
                        if (e.target.checked) next.add(t.id)
                        else next.delete(t.id)
                        setSelected(next)
                      }}
                      className="accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap text-fg-2">{formatDate(t.date)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-fg">
                      {t.merchant}
                      {t.recurringId && <Repeat className="h-3 w-3 text-muted" aria-label="Recurring" />}
                      {t.demo && <Badge tone="warn">Demo</Badge>}
                    </div>
                    {(t.notes || t.tags?.length > 0) && (
                      <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted">
                        {t.tags?.map((tag) => (
                          <span key={tag}>#{tag}</span>
                        ))}
                        {t.notes && <span className="truncate">{t.notes}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-fg-2">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: categories.find((c) => c.name === t.category)?.color ?? 'var(--muted)' }} />
                      {t.category}
                      {t.subcategory && <span className="text-muted">· {t.subcategory}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-fg-2">{t.paymentMethod ?? '—'}</td>
                  <td className={cn('tabular px-3 py-2.5 text-right font-medium whitespace-nowrap', t.type === 'income' ? 'text-good-fg' : 'text-fg')}>
                    {t.type === 'income' ? '+' : '−'}
                    {formatMoney(t.amount, t.currency)}
                    {t.currency !== settings.baseCurrency && <div className="text-[10px] font-normal text-muted">≈ {money(baseAmount(t))}</div>}
                  </td>
                  <td className="px-2 text-right whitespace-nowrap">
                    <Button size="icon-sm" variant="ghost" aria-label="Edit transaction" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete transaction"
                      onClick={async () => {
                        if (await confirm({ title: 'Delete transaction?', message: `${t.merchant} · ${formatMoney(t.amount, t.currency)} on ${formatDate(t.date)}`, confirmLabel: 'Delete', danger: true })) deleteTransaction(t.id).then(() => toast.success('Transaction deleted')).catch(toast.error)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > limit && (
        <div className="border-t border-line p-3 text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 200)}>
            Show more ({filtered.length - limit} remaining)
          </Button>
        </div>
      )}
      <TransactionFormModal open={!!editing} onClose={() => setEditing(undefined)} tx={editing} />
      <ImportTransactionsModal open={importing} onClose={() => setImporting(false)} />
    </Card>
  )
}
