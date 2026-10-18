import { useState } from 'react'
import { CalendarClock, Check, Pause, Pencil, Play, Plus, SkipForward, Trash2 } from 'lucide-react'
import type { Frequency, RecurringRule, TxType } from '@/data/models'
import { useCategories, useRecurring, useTransactions } from '@/data/hooks'
import { addRecurring, deleteRecurring, postRecurring, skipRecurring, updateRecurring } from '@/data/repos/spending'
import { monthlyEquivalent } from '@/domain/recurrence'
import { baseAmount } from '@/domain/spending'
import { Button } from '@/components/ui/Button'
import { Badge, Card, EmptyState, Loading, Segmented, StatCard } from '@/components/ui/display'
import { Checkbox, LabeledInput, LabeledSelect } from '@/components/ui/forms'
import { Modal } from '@/components/ui/Modal'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useSubmit } from '@/components/useSubmit'
import { useApp } from '@/app/AppContext'
import { formatDate, relativeDays } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/util'

const FREQ_LABEL: Record<Frequency, string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }

export function RecurringPage() {
  const { today, money } = useApp()
  const rules = useRecurring()
  const txs = useTransactions()
  const confirm = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState<RecurringRule | null | undefined>(undefined)
  if (!rules || !txs) return <Loading />
  const active = rules.filter((r) => r.active)
  const monthlyOut = active.filter((r) => r.type === 'expense').reduce((s, r) => s + monthlyEquivalent(baseAmount(r), r.frequency, r.interval), 0)
  const monthlyIn = active.filter((r) => r.type === 'income').reduce((s, r) => s + monthlyEquivalent(baseAmount(r), r.frequency, r.interval), 0)
  const due = active.filter((r) => r.nextDate <= today)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Recurring expenses / month" value={money(monthlyOut, { decimals: 0 })} sub="Monthly equivalent" icon={<CalendarClock className="h-4 w-4" />} tone="spending" />
        <StatCard label="Recurring income / month" value={money(monthlyIn, { decimals: 0 })} tone="good" icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Active schedules" value={active.length} />
        <StatCard label="Due now" value={due.length} sub={due.length ? 'Record or skip below' : 'All caught up'} tone={due.length ? 'warn' : 'good'} />
      </div>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(null)}>
          New recurring transaction
        </Button>
      </div>
      <Card>
        {rules.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="No recurring transactions" description="Add rent, subscriptions, SIP debits or salary. You decide whether each one is recorded automatically when due or confirmed by you." action={<Button size="sm" onClick={() => setEditing(null)}>Add one</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {rules.map((r) => {
              const posted = txs.filter((t) => t.recurringId === r.id).length
              const isDue = r.active && r.nextDate <= today
              return (
                <li key={r.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3.5', !r.active && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      {r.merchant}
                      <Badge>{FREQ_LABEL[r.frequency]}{r.interval > 1 ? ` ×${r.interval}` : ''}</Badge>
                      {r.autoPost && <Badge tone="accent">Auto-record</Badge>}
                      {!r.active && <Badge>Paused</Badge>}
                      {isDue && <Badge tone="warn">Due</Badge>}
                      {r.demo && <Badge tone="warn">Demo</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {r.category} · next {relativeDays(r.nextDate, today)} ({formatDate(r.nextDate)}) · {posted} recorded{r.endDate ? ` · ends ${formatDate(r.endDate)}` : ''}
                    </p>
                  </div>
                  <span className={cn('tabular text-sm font-medium', r.type === 'income' ? 'text-good-fg' : 'text-fg')}>
                    {r.type === 'income' ? '+' : '−'}
                    {formatMoney(r.amount, r.currency)}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {r.active && (
                      <>
                        <Button size="sm" variant={isDue ? 'soft' : 'ghost'} icon={<Check className="h-3.5 w-3.5" />} onClick={() => postRecurring(r).then(() => toast.success(`Recorded ${r.merchant} for ${formatDate(r.nextDate)}`)).catch(toast.error)} title="Record the next occurrence as a transaction">
                          Record
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Skip next occurrence" title="Skip next occurrence" onClick={() => skipRecurring(r).then(() => toast.info('Skipped one occurrence')).catch(toast.error)}>
                          <SkipForward className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button size="icon-sm" variant="ghost" aria-label={r.active ? 'Pause' : 'Resume'} onClick={() => updateRecurring(r.id, { active: !r.active }).catch(toast.error)}>
                      {r.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete"
                      onClick={async () => {
                        if (await confirm({ title: 'Delete recurring schedule?', message: `Already recorded transactions (${posted}) are kept.`, confirmLabel: 'Delete', danger: true })) deleteRecurring(r.id).then(() => toast.success('Schedule deleted')).catch(toast.error)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Edit recurring transaction' : 'New recurring transaction'} size="md">
        {editing !== undefined && <RecurringForm rule={editing ?? undefined} onDone={() => setEditing(undefined)} />}
      </Modal>
    </div>
  )
}

function RecurringForm({ rule, onDone }: { rule?: RecurringRule; onDone: () => void }) {
  const { today, settings } = useApp()
  const categories = useCategories()
  const [type, setType] = useState<TxType>(rule?.type ?? 'expense')
  const [merchant, setMerchant] = useState(rule?.merchant ?? '')
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '')
  const [category, setCategory] = useState(rule?.category ?? '')
  const [paymentMethod, setPaymentMethod] = useState(rule?.paymentMethod ?? '')
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly')
  const [interval, setIntervalN] = useState(String(rule?.interval ?? 1))
  const [startDate, setStartDate] = useState(rule?.startDate ?? today)
  const [nextDate, setNextDate] = useState(rule?.nextDate ?? '')
  const [endDate, setEndDate] = useState(rule?.endDate ?? '')
  const [autoPost, setAutoPost] = useState(rule?.autoPost ?? false)
  const { busy, errors, run } = useSubmit()
  const cats = (categories ?? []).filter((c) => c.type === type && !c.archived)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      type,
      merchant,
      amount: Number(amount),
      currency: rule?.currency ?? settings.baseCurrency,
      fxRate: rule?.fxRate ?? 1,
      category: category || cats[0]?.name || '',
      paymentMethod: paymentMethod || undefined,
      tags: rule?.tags ?? [],
      frequency,
      interval: Number(interval) || 1,
      startDate,
      endDate: endDate || undefined,
      autoPost,
      active: rule?.active ?? true,
    }
    const ok = await run(() => (rule ? updateRecurring(rule.id, { ...data, nextDate: nextDate || rule.nextDate, anchorDay: Number((nextDate || rule.nextDate).slice(8, 10)) }) : addRecurring({ ...data, nextDate: nextDate || startDate })), rule ? 'Schedule updated' : 'Recurring transaction created')
    if (ok) onDone()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented value={type} onChange={(v) => { setType(v); setCategory('') }} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="Description" required value={merchant} onChange={(e) => setMerchant(e.target.value)} error={errors.merchant} placeholder="e.g. Rent, Netflix, Salary" autoFocus />
        <LabeledInput label={`Amount (${rule?.currency ?? settings.baseCurrency})`} type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
        <LabeledSelect label="Category" value={category || cats[0]?.name || ''} onChange={(e) => setCategory(e.target.value)} error={errors.category}>
          {cats.map((c) => (
            <option key={c.id}>{c.name}</option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="">—</option>
          {settings.paymentMethods.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
          {Object.entries(FREQ_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </LabeledSelect>
        <LabeledInput label="Every N periods" type="number" min="1" max="24" value={interval} onChange={(e) => setIntervalN(e.target.value)} />
        <LabeledInput label="Start date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} error={errors.startDate} />
        <LabeledInput label="Next occurrence" type="date" value={nextDate || (rule ? rule.nextDate : startDate)} onChange={(e) => setNextDate(e.target.value)} />
        <LabeledInput label="End date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <div className="rounded-xl border border-line bg-surface-2/40 p-3">
        <Checkbox label="Record automatically when due" checked={autoPost} onChange={setAutoPost} />
        <p className="mt-1 pl-6 text-xs text-muted">When on, due occurrences are added as transactions the next time you open Personal HQ. When off, you confirm each one with “Record”.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  )
}
