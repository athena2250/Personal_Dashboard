import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { cn } from '@/lib/util'
import { ValidationError } from '@/data/saveStatus'

/* ───────────── Toasts ───────────── */

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastApi {
  success: (msg: string, action?: ToastItem['action']) => void
  error: (msg: string | unknown) => void
  info: (msg: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function errorMessage(err: unknown): string {
  if (err instanceof ValidationError) return err.message
  if (err instanceof Error) {
    if (err.name === 'QuotaExceededError') return 'Browser storage is full. Export a backup and free some space.'
    return err.message
  }
  return String(err)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (kind: ToastKind, message: string, action?: ToastItem['action']) => {
      const id = ++counter.current
      setItems((xs) => [...xs.slice(-3), { id, kind, message, action }])
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : action ? 6000 : 3500)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(
    () => ({
      success: (m, a) => push('success', m, a),
      error: (m) => push('error', typeof m === 'string' ? m : errorMessage(m)),
      info: (m) => push('info', m),
    }),
    [push],
  )
  const icons = { success: CheckCircle2, error: XCircle, info: Info }
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-0 bottom-20 left-0 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:items-end md:px-6" aria-live="polite">
        {items.map((t) => {
          const Icon = icons[t.kind]
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="animate-fade-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm shadow-xl"
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.kind === 'success' && 'text-good-fg', t.kind === 'error' && 'text-bad-fg', t.kind === 'info' && 'text-accent')} />
              <span className="flex-1 text-fg">{t.message}</span>
              {t.action && (
                <button
                  className="font-medium text-accent hover:underline"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast outside provider')
  return ctx
}

/* ───────────── Confirm dialog ───────────── */

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  danger?: boolean
  /** When set, the user must type this text to confirm. */
  typeToConfirm?: string
}

const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = useState('')
  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped('')
        setState({ ...o, resolve })
      }),
    [],
  )
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const blocked = !!state?.typeToConfirm && typed !== state.typeToConfirm
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            {state?.danger && <AlertTriangle className="h-4 w-4 text-bad-fg" />}
            {state?.title}
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-fg-2">
          {state?.message}
          {state?.typeToConfirm && (
            <div>
              <p className="mb-1.5 text-xs text-muted">
                Type <span className="font-mono text-fg">{state.typeToConfirm}</span> to confirm.
              </p>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                aria-label="Confirmation text"
              />
            </div>
          )}
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm outside provider')
  return ctx
}
