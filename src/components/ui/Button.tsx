import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/util'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_oklab,var(--accent)_70%,var(--accent-2))] text-white shadow-[0_6px_20px_-8px_var(--accent)] hover:brightness-110',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3 hover:border-line-strong',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-2',
  danger: 'bg-bad/90 text-white hover:bg-bad',
  soft: 'bg-accent-soft text-accent hover:brightness-110',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-xl',
  'icon-sm': 'h-7 w-7 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

/** A router link styled as a button (avoids nesting <button> inside <a>). */
export function ButtonLink({ to, variant = 'secondary', size = 'md', icon, className, children, ...rest }: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children?: ReactNode; 'aria-label'?: string; title?: string }) {
  return (
    <Link
      to={to}
      className={cn('inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98]', variants[variant], sizes[size], className)}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  )
}
