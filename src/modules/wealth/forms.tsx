import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { AssetType, Compounding, Investment, InvestmentTxn, InvTxnType, LinkRef, SipPlan } from '@/data/models'
import { addInvestment, addInvTxn, addValuation, updateInvestment, updateInvTxn } from '@/data/repos/wealth'
import { useInvestments } from '@/data/hooks'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, LabeledInput, LabeledSelect, LabeledTextarea, numOrUndef } from '@/components/ui/forms'
import { useSubmit } from '@/components/useSubmit'
import { useApp } from '@/app/AppContext'
import { ASSET_TYPE_LABELS, fdValue } from '@/domain/wealth'
import { CURRENCIES } from '@/lib/money'
import { addMonths } from '@/lib/dates'
import { isSafeUrl } from '@/lib/util'

/* ───────────── Investment ───────────── */

export function InvestmentFormModal({ open, onClose, investment, presetType, presetProvider }: { open: boolean; onClose: () => void; investment?: Investment; presetType?: AssetType; presetProvider?: string }) {
  return (
    <Modal open={open} onClose={onClose} title={investment ? 'Edit investment' : 'Add investment or account'} size="lg">
      {open && <InvestmentForm investment={investment} presetType={presetType} presetProvider={presetProvider} onDone={onClose} />}
    </Modal>
  )
}

function InvestmentForm({ investment, presetType, presetProvider, onDone }: { investment?: Investment; presetType?: AssetType; presetProvider?: string; onDone: () => void }) {
  const { today, settings, money } = useApp()
  const inv = investment
  const [assetType, setAssetType] = useState<AssetType>(inv?.assetType ?? presetType ?? 'sip')
  const [customType, setCustomType] = useState(inv?.customType ?? '')
  const [name, setName] = useState(inv?.name ?? '')
  const [provider, setProvider] = useState(inv?.provider ?? presetProvider ?? '')
  const [currency, setCurrency] = useState(inv?.currency ?? settings.baseCurrency)
  const [startDate, setStartDate] = useState(inv?.startDate ?? today)
  const [initial, setInitial] = useState('')
  const [interestRate, setInterestRate] = useState(inv?.interestRate != null ? String(inv.interestRate) : '')
  const [compounding, setCompounding] = useState<Compounding>(inv?.compounding ?? 'quarterly')
  const [maturityDate, setMaturityDate] = useState(inv?.maturityDate ?? '')
  const [maturityAmount, setMaturityAmount] = useState(inv?.maturityAmount != null ? String(inv.maturityAmount) : '')
  const [expectedReturn, setExpectedReturn] = useState(inv?.expectedReturn != null ? String(inv.expectedReturn) : '')
  const [isLiability, setIsLiability] = useState(inv?.isLiability ?? false)
  const [notes, setNotes] = useState(inv?.notes ?? '')
  const [links, setLinks] = useState<LinkRef[]>(inv?.links ?? [])
  const [sipAmount, setSipAmount] = useState(inv?.sip ? String(inv.sip.amount) : '')
  const [sipFreq, setSipFreq] = useState<SipPlan['frequency']>(inv?.sip?.frequency ?? 'monthly')
  const [sipNext, setSipNext] = useState(inv?.sip?.nextDate ?? '')
  const [sipActive, setSipActive] = useState(inv?.sip?.active ?? true)
  const { busy, errors, setErrors, run } = useSubmit()

  const isSip = assetType === 'sip'
  const isFd = assetType === 'fd'
  const principal = Number(initial)
  const fdPreview = isFd && principal > 0 && Number(interestRate) > 0 && maturityDate ? fdValue(principal, Number(interestRate), startDate, maturityDate, compounding) : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const badLink = links.find((l) => l.url && !isSafeUrl(l.url))
    if (badLink) {
      setErrors({ links: 'Links must be full URLs starting with https://' })
      return
    }
    if (isSip && !(Number(sipAmount) > 0)) {
      setErrors({ sipAmount: 'Enter the SIP installment amount' })
      return
    }
    const sip: SipPlan | undefined = isSip
      ? {
          amount: Number(sipAmount),
          frequency: sipFreq,
          startDate,
          nextDate: sipNext || startDate,
          dayOfMonth: Number((sipNext || startDate).slice(8, 10)),
          active: sipActive,
        }
      : undefined
    const data = {
      name,
      provider,
      assetType,
      customType: assetType === 'other' ? customType || undefined : undefined,
      currency,
      startDate,
      interestRate: numOrUndef(interestRate),
      compounding: isFd || assetType === 'cash' ? compounding : undefined,
      maturityDate: isFd ? maturityDate || undefined : undefined,
      maturityAmount: isFd ? numOrUndef(maturityAmount) : undefined,
      expectedReturn: numOrUndef(expectedReturn),
      isLiability,
      notes: notes || undefined,
      links: links.filter((l) => l.url),
      sip,
      archived: inv?.archived ?? false,
    }
    const ok = await run(() => (inv ? updateInvestment(inv.id, data) : addInvestment(data, numOrUndef(initial))), inv ? 'Investment updated' : `${name || 'Investment'} added`)
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <div className="mb-2 text-xs font-medium text-fg-2">Type</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setAssetType(t)}
              aria-pressed={assetType === t}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${assetType === t ? 'border-[var(--wealth)] bg-wealth-soft text-fg' : 'border-line text-fg-2 hover:border-line-strong'}`}
            >
              {ASSET_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabeledInput label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder={isSip ? 'e.g. Parag Parikh Flexi Cap SIP' : isFd ? 'e.g. HDFC FD #1234' : 'e.g. Savings account'} autoFocus />
        <LabeledInput label="Provider / institution" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder={isSip ? 'Groww' : isFd ? 'HDFC Bank' : ''} />
        {assetType === 'other' && <LabeledInput label="Custom asset type" value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="e.g. Gold, PPF, EPF, NPS, Crypto" />}
        <LabeledInput label={isFd ? 'Start date' : 'Investment / opening date'} type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} error={errors.startDate} />
        <LabeledSelect label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {[...new Set([settings.baseCurrency, ...CURRENCIES])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </LabeledSelect>
        {!inv && (
          <LabeledInput
            label={isFd ? 'Principal' : isSip ? 'Lump sum already invested (optional)' : 'Amount invested / opening balance'}
            type="number"
            step="0.01"
            min="0"
            value={initial}
            onChange={(e) => setInitial(e.target.value)}
            hint={isSip ? 'Leave empty and record past installments individually, or import them from CSV.' : 'Recorded as a contribution — not as profit.'}
          />
        )}
      </div>

      {isSip && (
        <fieldset className="space-y-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-xs font-semibold text-fg-2">SIP plan</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <LabeledInput label="Installment amount" required type="number" step="0.01" min="0" value={sipAmount} onChange={(e) => setSipAmount(e.target.value)} error={errors.sipAmount} />
            <LabeledSelect label="Frequency" value={sipFreq} onChange={(e) => setSipFreq(e.target.value as SipPlan['frequency'])}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="weekly">Weekly</option>
            </LabeledSelect>
            <LabeledInput label="Next installment" type="date" value={sipNext} onChange={(e) => setSipNext(e.target.value)} hint="Defaults to the start date" />
          </div>
          <Checkbox label="SIP is active" checked={sipActive} onChange={setSipActive} />
        </fieldset>
      )}

      {(isFd || assetType === 'cash') && (
        <fieldset className="space-y-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-xs font-semibold text-fg-2">{isFd ? 'Fixed deposit terms' : 'Interest'}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label="Interest rate (% p.a.)" type="number" step="0.01" min="0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} error={errors.interestRate} />
            <LabeledSelect label="Compounding" value={compounding} onChange={(e) => setCompounding(e.target.value as Compounding)}>
              <option value="quarterly">Quarterly (typical for Indian bank FDs)</option>
              <option value="monthly">Monthly</option>
              <option value="half-yearly">Half-yearly</option>
              <option value="yearly">Yearly</option>
              <option value="simple">Simple interest</option>
            </LabeledSelect>
            {isFd && (
              <>
                <LabeledInput label="Maturity date" type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} error={errors.maturityDate} />
                <LabeledInput label="Maturity amount (if known)" type="number" step="0.01" min="0" value={maturityAmount} onChange={(e) => setMaturityAmount(e.target.value)} hint="From your FD receipt. Takes precedence over the calculated figure." />
              </>
            )}
          </div>
          {isFd && !maturityDate && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="text-muted">Tenure:</span>
              {[6, 12, 24, 36, 60].map((m) => (
                <button type="button" key={m} className="rounded-md bg-surface-2 px-2 py-0.5 text-fg-2 hover:text-fg" onClick={() => setMaturityDate(addMonths(startDate, m))}>
                  {m < 12 ? `${m} mo` : `${m / 12} yr`}
                </button>
              ))}
            </div>
          )}
          {fdPreview != null && <p className="text-xs text-muted">Calculated maturity ≈ {money(fdPreview)} (estimate from rate and compounding; banks may differ slightly due to TDS and day counts).</p>}
        </fieldset>
      )}

      {!isFd && assetType !== 'cash' && (
        <LabeledInput label="Expected return (% p.a., optional)" type="number" step="0.1" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} hint="For your reference only — never used to compute current value or returns." />
      )}

      <Field label="Links (e.g. your original Excel Online / OneDrive tracker)" error={errors.links} hint="Links only open the file — Personal HQ never edits or migrates your spreadsheets.">
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input value={l.label} placeholder="Label" className="w-1/3" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input value={l.url} placeholder="https://onedrive.live.com/…" type="url" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLinks([...links, { label: 'SIP tracker (Excel)', url: '' }])}>
            Add link
          </Button>
        </div>
      </Field>
      <Checkbox label="This is a liability (loan / credit) — subtract from net worth" checked={isLiability} onChange={setIsLiability} />
      <LabeledTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {inv ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  )
}

/* ───────────── Contribution / withdrawal ───────────── */

const TXN_LABELS: Record<InvTxnType, string> = {
  contribution: 'Contribution (money in)',
  withdrawal: 'Withdrawal / redemption',
  income: 'Interest / dividend paid out',
  fee: 'Fee / charge',
}

export function InvTxnFormModal({ open, onClose, investmentId, txn }: { open: boolean; onClose: () => void; investmentId?: string; txn?: InvestmentTxn }) {
  return (
    <Modal open={open} onClose={onClose} title={txn ? 'Edit entry' : 'Add investment entry'} size="sm">
      {open && <InvTxnForm investmentId={investmentId} txn={txn} onDone={onClose} />}
    </Modal>
  )
}

function InvTxnForm({ investmentId, txn, onDone }: { investmentId?: string; txn?: InvestmentTxn; onDone: () => void }) {
  const { today } = useApp()
  const investments = useInvestments()
  const active = (investments ?? []).filter((i) => !i.archived)
  const [invId, setInvId] = useState(txn?.investmentId ?? investmentId ?? '')
  const effective = invId || active[0]?.id || ''
  const inv = active.find((i) => i.id === effective)
  const [type, setType] = useState<InvTxnType>(txn?.type ?? 'contribution')
  const [date, setDate] = useState(txn?.date ?? today)
  const [amount, setAmount] = useState(txn ? String(txn.amount) : inv?.sip ? String(inv.sip.amount) : '')
  const [units, setUnits] = useState(txn?.units != null ? String(txn.units) : '')
  const [nav, setNav] = useState(txn?.nav != null ? String(txn.nav) : '')
  const [notes, setNotes] = useState(txn?.notes ?? '')
  const { busy, errors, run } = useSubmit()

  if (investments && !active.length) return <p className="text-sm text-muted">Add an investment first, then record entries against it.</p>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = { investmentId: effective, type, date, amount: Number(amount), units: numOrUndef(units), nav: numOrUndef(nav), notes: notes || undefined, source: 'manual' as const }
    const ok = await run(() => (txn ? updateInvTxn(txn.id, data) : addInvTxn(data)), txn ? 'Entry updated' : 'Entry recorded')
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <LabeledSelect label="Investment" value={effective} onChange={(e) => setInvId(e.target.value)} disabled={!!txn}>
        {active.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </LabeledSelect>
      <LabeledSelect label="Type" value={type} onChange={(e) => setType(e.target.value as InvTxnType)}>
        {(Object.keys(TXN_LABELS) as InvTxnType[]).map((t) => (
          <option key={t} value={t}>
            {TXN_LABELS[t]}
          </option>
        ))}
      </LabeledSelect>
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <LabeledInput label="Amount" type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} autoFocus />
        {(inv?.assetType === 'sip' || inv?.assetType === 'mutual_fund' || inv?.assetType === 'stock' || inv?.assetType === 'etf') && (
          <>
            <LabeledInput label="Units (optional)" type="number" step="any" min="0" value={units} onChange={(e) => setUnits(e.target.value)} />
            <LabeledInput label="NAV / price (optional)" type="number" step="any" min="0" value={nav} onChange={(e) => setNav(e.target.value)} />
          </>
        )}
      </div>
      <LabeledInput label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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

/* ───────────── Valuation ───────────── */

export function ValuationFormModal({ open, onClose, investmentId }: { open: boolean; onClose: () => void; investmentId?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Update current value" description="Enter the value shown in Groww / your bank statement. This is how returns are calculated." size="sm">
      {open && <ValuationForm investmentId={investmentId} onDone={onClose} />}
    </Modal>
  )
}

function ValuationForm({ investmentId, onDone }: { investmentId?: string; onDone: () => void }) {
  const { today } = useApp()
  const investments = useInvestments()
  const active = (investments ?? []).filter((i) => !i.archived)
  const [invId, setInvId] = useState(investmentId ?? '')
  const effective = invId || active[0]?.id || ''
  const [date, setDate] = useState(today)
  const [value, setValue] = useState('')
  const [source, setSource] = useState<'actual' | 'estimate'>('actual')
  const [notes, setNotes] = useState('')
  const { busy, errors, run } = useSubmit()

  if (investments && !active.length) return <p className="text-sm text-muted">Add an investment first.</p>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await run(() => addValuation({ investmentId: effective, date, value: Number(value), source, notes: notes || undefined }), 'Valuation saved')
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <LabeledSelect label="Investment" value={effective} onChange={(e) => setInvId(e.target.value)}>
        {active.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </LabeledSelect>
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="As of date" type="date" required value={date} max={today} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <LabeledInput label="Current value" type="number" step="0.01" min="0" required value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} autoFocus />
      </div>
      <LabeledSelect label="Source" value={source} onChange={(e) => setSource(e.target.value as 'actual' | 'estimate')} hint="Estimates are labelled everywhere they appear.">
        <option value="actual">Actual — from app / statement</option>
        <option value="estimate">Estimate — my own guess</option>
      </LabeledSelect>
      <LabeledInput label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Groww app value" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save value
        </Button>
      </div>
    </form>
  )
}
