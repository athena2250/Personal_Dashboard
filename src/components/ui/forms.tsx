import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/util'

const control =
  'w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-muted transition-colors hover:border-line-strong focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/40 disabled:opacity-60 aria-[invalid=true]:border-bad'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-9', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-[80px] py-2', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-9 cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  )
})

export function Field({
  label,
  error,
  hint,
  children,
  className,
  required,
  htmlFor,
}: {
  label: ReactNode
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
  required?: boolean
  htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-fg-2">
        {label}
        {required && <span className="ml-0.5 text-bad-fg">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-bad-fg" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** Label + control with auto-generated id. */
export function LabeledInput({ label, error, hint, required, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={id} className={className}>
      <Input id={id} aria-invalid={!!error} required={required} {...rest} />
    </Field>
  )
}

export function LabeledSelect({ label, error, hint, required, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; error?: string; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={id} className={className}>
      <Select id={id} aria-invalid={!!error} required={required} {...rest}>
        {children}
      </Select>
    </Field>
  )
}

export function LabeledTextarea({ label, error, hint, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; error?: string; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id} className={className}>
      <Textarea id={id} aria-invalid={!!error} {...rest} />
    </Field>
  )
}

export function Checkbox({ label, checked, onChange, className, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-fg-2 select-none', disabled && 'opacity-60', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-line accent-[var(--accent)]"
      />
      {label}
    </label>
  )
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-[var(--accent)]' : 'bg-surface-3')}
      >
        <span className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
    </label>
  )
}

/** Parses a number input value; '' → undefined. */
export function numOrUndef(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
