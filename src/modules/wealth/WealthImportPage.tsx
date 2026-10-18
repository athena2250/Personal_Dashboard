import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileUp, ShieldCheck } from 'lucide-react'
import type { AssetType } from '@/data/models'
import { useInvestments } from '@/data/hooks'
import { importInvestmentRows, type InvImportRow } from '@/data/repos/wealth'
import { autoMap, parseCsv, parseDate, type DateFormat, type ParsedCsv } from '@/domain/csv'
import { ASSET_TYPE_LABELS } from '@/domain/wealth'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/display'
import { Checkbox, LabeledInput, LabeledSelect } from '@/components/ui/forms'
import { useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { parseAmount } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { isSafeUrl } from '@/lib/util'

const SYN = {
  investmentName: ['investment', 'fund', 'scheme', 'schemename', 'fundname', 'name', 'holding'],
  date: ['date', 'installmentdate', 'transactiondate', 'navdate'],
  amount: ['amount', 'investedamount', 'sipamount', 'value', 'contribution'],
  type: ['type', 'transactiontype'],
  units: ['units', 'unitsallotted', 'quantity'],
  nav: ['nav', 'price', 'navprice'],
  notes: ['notes', 'remarks'],
}

export function WealthImportPage() {
  const { settings } = useApp()
  const investments = useInvestments()
  const toast = useToast()
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [fileName, setFileName] = useState('')
  const [map, setMap] = useState<Record<string, string>>({})
  const [fixedInvestment, setFixedInvestment] = useState('')
  const [rowType, setRowType] = useState<'contribution' | 'valuation' | 'column'>('contribution')
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto')
  const [createMissing, setCreateMissing] = useState(true)
  const [assetType, setAssetType] = useState<AssetType>('sip')
  const [provider, setProvider] = useState('Groww')
  const [busy, setBusy] = useState(false)

  const onFile = async (f: File) => {
    try {
      const parsed = parseCsv(await f.text())
      if (!parsed.headers.length) throw new Error('No header row found.')
      setCsv(parsed)
      setFileName(f.name)
      const m = autoMap(parsed.headers, SYN)
      setMap(m)
      if (m.type) setRowType('column')
    } catch (e) {
      toast.error(e)
    }
  }

  const rows = useMemo(() => {
    const ok: InvImportRow[] = []
    const errors: string[] = []
    if (!csv) return { ok, errors }
    const fixedName = investments?.find((i) => i.id === fixedInvestment)?.name
    csv.rows.forEach((r, i) => {
      const line = i + 2
      const name = fixedName ?? r[map.investmentName]?.trim()
      if (!name) return errors.push(`Row ${line}: no investment name`)
      const date = parseDate(r[map.date], dateFormat)
      if (!date) return errors.push(`Row ${line}: unreadable date “${r[map.date] ?? ''}”`)
      const amount = parseAmount(r[map.amount])
      if (amount == null || amount === 0) return errors.push(`Row ${line}: missing amount`)
      let type: InvImportRow['type'] = rowType === 'valuation' ? 'valuation' : 'contribution'
      if (rowType === 'column') {
        const v = (r[map.type] ?? '').toLowerCase()
        type = /valu|current|market/.test(v) ? 'valuation' : /redeem|redemption|withdraw|sell|switch.?out/.test(v) ? 'withdrawal' : /dividend|interest/.test(v) ? 'income' : /fee|charge|stamp/.test(v) ? 'fee' : 'contribution'
      }
      ok.push({ investmentName: name, date, type, amount: Math.abs(amount), units: map.units ? parseAmount(r[map.units]) ?? undefined : undefined, nav: map.nav ? parseAmount(r[map.nav]) ?? undefined : undefined, notes: map.notes ? r[map.notes] : undefined })
    })
    return { ok, errors }
  }, [csv, map, fixedInvestment, rowType, dateFormat, investments])

  const doImport = async () => {
    setBusy(true)
    try {
      const res = await importInvestmentRows(rows.ok, { createMissing, assetType, provider, currency: settings.baseCurrency })
      toast.success(`Imported ${res.added} entr${res.added === 1 ? 'y' : 'ies'}${res.skipped ? `, skipped ${res.skipped} (duplicates or unmatched)` : ''}${res.created.length ? `. Created: ${res.created.join(', ')}` : ''}`)
      if (res.unmatched.length) toast.info(`Not matched to an investment: ${res.unmatched.slice(0, 5).join(', ')}`)
      setCsv(null)
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
        <option key={h}>{h}</option>
      ))}
    </LabeledSelect>
  )

  const linked = (investments ?? []).flatMap((i) => i.links.filter((l) => isSafeUrl(l.url)).map((l) => ({ ...l, inv: i })))

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="Import from CSV" subtitle="e.g. a CSV copy of your SIP Excel tracker, or an export from Groww" icon={<FileUp className="h-4 w-4 text-muted" />} />
        <CardBody className="space-y-4">
          {!csv ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line-strong px-6 py-12 text-center hover:border-[var(--wealth)]">
              <FileUp className="h-8 w-8 text-muted" />
              <span className="text-sm text-fg">Choose a .csv file</span>
              <span className="max-w-sm text-xs text-muted">In Excel Online: File → Save a copy / Download as → CSV. Each row should be one installment or one valuation.</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          ) : (
            <>
              <p className="text-sm text-fg-2">
                <strong className="text-fg">{fileName}</strong> — {csv.rows.length} rows.{' '}
                <button className="text-accent hover:underline" onClick={() => setCsv(null)}>
                  Choose another
                </button>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledSelect label="Rows belong to" value={fixedInvestment} onChange={(e) => setFixedInvestment(e.target.value)}>
                  <option value="">Investment named in a column</option>
                  {(investments ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </LabeledSelect>
                {!fixedInvestment && col('investmentName', 'Investment name column', true)}
                {col('date', 'Date column', true)}
                <LabeledSelect label="Date format" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                  <option value="auto">Auto (day-first if ambiguous)</option>
                  <option value="DMY">DD/MM/YYYY</option>
                  <option value="MDY">MM/DD/YYYY</option>
                </LabeledSelect>
                {col('amount', 'Amount column', true)}
                <LabeledSelect label="Rows are" value={rowType} onChange={(e) => setRowType(e.target.value as typeof rowType)}>
                  <option value="contribution">Contributions / installments</option>
                  <option value="valuation">Valuations (current value snapshots)</option>
                  <option value="column">Determined by a type column</option>
                </LabeledSelect>
                {rowType === 'column' && col('type', 'Type column', true)}
                {col('units', 'Units (optional)')}
                {col('nav', 'NAV (optional)')}
              </div>
              {!fixedInvestment && (
                <div className="space-y-3 rounded-xl border border-line p-3">
                  <Checkbox label="Create investments that don't exist yet" checked={createMissing} onChange={setCreateMissing} />
                  {createMissing && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <LabeledSelect label="Type for new investments" value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
                        {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </LabeledSelect>
                      <LabeledInput label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} />
                    </div>
                  )}
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-medium text-fg-2">
                  Preview — {rows.ok.length} ready{rows.errors.length ? `, ${rows.errors.length} skipped` : ''}
                </p>
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-line">
                      {rows.ok.slice(0, 6).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-fg">{r.investmentName}</td>
                          <td className="px-3 py-1.5 text-fg-2">{formatDate(r.date)}</td>
                          <td className="px-3 py-1.5">{r.type}</td>
                          <td className="tabular px-3 py-1.5 text-right">{r.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.errors.length > 0 && <p className="mt-1 text-xs text-muted">First issue: {rows.errors[0]}</p>}
                <p className="mt-2 text-xs text-muted">Exact duplicates are skipped, so re-importing an updated copy of the same sheet is safe.</p>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" loading={busy} disabled={!rows.ok.length} onClick={doImport}>
                  Import {rows.ok.length} rows
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Your original spreadsheets" icon={<FileSpreadsheet className="h-4 w-4 text-muted" />} />
          <CardBody className="space-y-3 text-sm text-fg-2">
            <p className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-good-fg" />
              Personal HQ never connects to OneDrive, and never edits, replaces or migrates your Excel files. Imports read only the CSV copy you choose.
            </p>
            {linked.length ? (
              <ul className="space-y-1.5">
                {linked.map((l) => (
                  <li key={l.url + l.inv.id}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {l.label || 'Spreadsheet'}
                    </a>{' '}
                    <span className="text-xs text-muted">· {l.inv.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">Add links to your Excel Online trackers on each holding (Edit → Links) so they're one click away.</p>
            )}
            <ButtonLink to="/wealth/holdings" size="sm">
              Go to holdings
            </ButtonLink>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Suggested CSV layout" />
          <CardBody>
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-[11px] text-fg-2">{`Investment,Date,Type,Amount,Units,NAV
Flexi Cap SIP,05/01/2026,Contribution,5000,61.23,81.66
Flexi Cap SIP,31/01/2026,Valuation,5120,,`}</pre>
            <p className="mt-2 text-xs text-muted">Type values recognised: contribution / SIP, valuation / current value, redemption / withdrawal, dividend / interest, fee.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
