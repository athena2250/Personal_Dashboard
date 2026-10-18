import { useId } from 'react'
import { ExternalLink } from 'lucide-react'
import type { FieldDef } from '@/data/models'
import { Checkbox, Field, Input, Select, Textarea } from './ui/forms'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { isSafeUrl } from '@/lib/util'

/** Renders an input for a custom tracker field. */
export function FieldInput({ field, value, onChange, error }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = useId()
  const str = value == null ? '' : String(value)
  let control
  switch (field.type) {
    case 'longtext':
      control = <Textarea id={id} value={str} onChange={(e) => onChange(e.target.value)} />
      break
    case 'number':
    case 'currency':
      control = (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          value={str}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )
      break
    case 'date':
      control = <Input id={id} type="date" value={str} onChange={(e) => onChange(e.target.value || undefined)} />
      break
    case 'checkbox':
      return (
        <div className="flex items-end pb-2">
          <Checkbox label={field.name} checked={!!value} onChange={onChange} />
        </div>
      )
    case 'select':
      control = (
        <Select id={id} value={str} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {str && !(field.options ?? []).includes(str) && <option value={str}>{str}</option>}
        </Select>
      )
      break
    case 'url':
      control = <Input id={id} type="url" placeholder="https://" value={str} onChange={(e) => onChange(e.target.value || undefined)} />
      break
    default:
      control = <Input id={id} value={str} onChange={(e) => onChange(e.target.value || undefined)} />
  }
  return (
    <Field label={field.name} htmlFor={id} error={error} required={field.required} className={field.type === 'longtext' ? 'sm:col-span-2' : undefined}>
      {control}
    </Field>
  )
}

/** Displays a custom field value. */
export function FieldValue({ field, value, currency = 'INR' }: { field: FieldDef; value: unknown; currency?: string }) {
  if (value == null || value === '') return <span className="text-muted">—</span>
  switch (field.type) {
    case 'checkbox':
      return <span>{value ? 'Yes' : 'No'}</span>
    case 'date':
      return <span className="tabular">{formatDate(String(value))}</span>
    case 'currency':
      return <span className="tabular">{formatMoney(Number(value), currency)}</span>
    case 'number':
      return <span className="tabular">{String(value)}</span>
    case 'url':
      return isSafeUrl(String(value)) ? (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[220px] items-center gap-1 truncate text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          <span className="truncate">{String(value).replace(/^https?:\/\/(www\.)?/, '')}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span>{String(value)}</span>
      )
    default:
      return <span className="line-clamp-2">{String(value)}</span>
  }
}

export function validateFields(fields: FieldDef[], values: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const v = values[f.id]
    if (f.required && (v == null || v === '')) errors[`values.${f.id}`] = `${f.name} is required`
    if (f.type === 'url' && v && !isSafeUrl(String(v))) errors[`values.${f.id}`] = 'Enter a full URL starting with https://'
    if ((f.type === 'number' || f.type === 'currency') && v != null && v !== '' && !Number.isFinite(Number(v))) errors[`values.${f.id}`] = 'Enter a number'
  }
  return errors
}
