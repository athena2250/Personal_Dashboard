import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Settings } from '@/data/models'
import { useSettings } from '@/data/hooks'
import { ensureInitialized } from '@/data/repos/settings'
import { processAutoPost } from '@/data/repos/spending'
import { setAppTimezone, todayInTz } from '@/lib/tz'
import { formatMoney } from '@/lib/money'
import { Loading } from '@/components/ui/display'
import { useToast } from '@/components/ui/feedback'

interface AppCtx {
  settings: Settings
  today: string
  currency: string
  money: (v: number | null | undefined, opts?: { compact?: boolean; decimals?: number; sign?: boolean }) => string
}

const Ctx = createContext<AppCtx | null>(null)

function applyTheme(theme: Settings['theme']) {
  const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme
  document.documentElement.dataset.theme = resolved
  try {
    localStorage.setItem('phq-theme', theme === 'system' ? '' : theme)
  } catch {
    /* storage may be unavailable */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [initError, setInitError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const settings = useSettings()
  const toast = useToast()

  useEffect(() => {
    ensureInitialized()
      .then(() => setReady(true))
      .catch((e: unknown) => setInitError(e instanceof Error ? e.message : String(e)))
  }, [])

  const tz = settings?.timezone
  if (tz) setAppTimezone(tz)
  const [today, setToday] = useState(() => todayInTz())
  useEffect(() => {
    setToday(todayInTz())
    const t = setInterval(() => setToday(todayInTz()), 60_000)
    return () => clearInterval(t)
  }, [tz])

  useEffect(() => {
    if (!settings) return
    applyTheme(settings.theme)
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const h = () => applyTheme('system')
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [settings?.theme])

  // Auto-post recurring transactions that are due (only rules with auto-post enabled).
  useEffect(() => {
    if (!ready) return
    processAutoPost(today)
      .then((n) => {
        if (n > 0) toast.info(`Recorded ${n} recurring transaction${n > 1 ? 's' : ''} that came due.`)
      })
      .catch((e) => toast.error(e))
  }, [ready, today])

  const currency = settings?.baseCurrency ?? 'INR'
  const money = useCallback((v: number | null | undefined, opts?: { compact?: boolean; decimals?: number; sign?: boolean }) => formatMoney(v, currency, opts), [currency])
  const value = useMemo(() => (settings ? { settings, today, currency, money } : null), [settings, today, currency, money])

  if (initError)
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-line bg-surface p-6 text-sm">
        <h1 className="mb-2 text-base font-semibold text-bad-fg">Could not open local storage</h1>
        <p className="text-fg-2">{initError}</p>
        <p className="mt-3 text-muted">Personal HQ stores data in your browser's IndexedDB. Private browsing modes or blocked site data can prevent this. Try a normal window.</p>
      </div>
    )
  if (!ready || !value) return <Loading label="Opening your HQ…" />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp outside AppProvider')
  return c
}
