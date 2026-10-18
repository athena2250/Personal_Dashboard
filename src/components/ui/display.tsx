import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/util'

export function Card({ className, children, as: As = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn('rounded-2xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </As>
  )
}

export function CardHeader({ title, subtitle, action, icon, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>
}

export type Tone = 'default' | 'accent' | 'good' | 'warn' | 'bad' | 'learning' | 'spending' | 'wealth' | 'events'

const toneBadge: Record<Tone, string> = {
  default: 'bg-surface-3 text-fg-2',
  accent: 'bg-accent-soft text-accent',
  good: 'bg-good/15 text-good-fg',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad-fg',
  learning: 'bg-learning-soft text-learning',
  spending: 'bg-spending-soft text-spending',
  wealth: 'bg-wealth-soft text-wealth',
  events: 'bg-events-soft text-events',
}

export function Badge({ tone = 'default', children, className, color }: { tone?: Tone; children: ReactNode; className?: string; color?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', !color && toneBadge[tone], className)}
      style={color ? { background: `color-mix(in oklab, ${color} 16%, transparent)`, color: `color-mix(in oklab, ${color} 80%, var(--fg))` } : undefined}
    >
      {children}
    </span>
  )
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: color }} aria-hidden />
}

export function ProgressBar({ value, color = 'var(--accent)', className, label, height = 'h-1.5' }: { value: number; color?: string; className?: string; label?: string; height?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-surface-3', height, className)} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  )
}

export function ProgressRing({ value, size = 64, stroke = 7, color = 'var(--accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 600ms ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{children}</div>
    </div>
  )
}

export function EmptyState({ icon, title, description, action, className, compact }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-6' : 'gap-3 py-12', className)}>
      {icon && <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

export function Delta({ value, invert, suffix, format }: { value: number | null | undefined; invert?: boolean; suffix?: string; format?: (v: number) => string }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs text-muted">—</span>
  const up = value > 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  if (value === 0) return <span className="text-xs text-muted">No change{suffix ? ` ${suffix}` : ''}</span>
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good ? 'text-good-fg' : 'text-bad-fg')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {format ? format(Math.abs(value)) : `${Math.abs(value * 100).toFixed(1)}%`}
      {suffix && <span className="ml-1 font-normal text-muted">{suffix}</span>}
    </span>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'accent',
  className,
  to,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  tone?: Tone
  className?: string
  to?: string
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', toneBadge[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-fg">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </>
  )
  const cls = cn('rounded-2xl border border-line bg-surface p-4 shadow-card', to && 'block transition-colors hover:border-line-strong', className)
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">{eyebrow}</div>}
          <h1 className="truncate text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-xl border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[10px] font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Horizontal tab nav that scrolls on mobile. */
export function TabNav<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; icon?: ReactNode }[] }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="inline-flex min-w-full gap-1 border-b border-line sm:min-w-0">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              value === t.value ? 'border-[var(--accent)] text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>
}
