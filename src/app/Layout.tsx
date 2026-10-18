import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  CalendarDays,
  Check,
  CircleAlert,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  Menu,
  Moon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
  TrendingUp,
  Wallet,
  X,
  Layers,
  Sparkles,
} from 'lucide-react'
import { useSaveStatus } from '@/data/saveStatus'
import { useDemoCount, useTrackers } from '@/data/hooks'
import { updateSettings } from '@/data/repos/settings'
import { cn } from '@/lib/util'
import { Kbd } from '@/components/ui/display'
import { Button } from '@/components/ui/Button'
import { TrackerIcon } from '@/components/ui/Icon'
import { CommandPalette } from './CommandPalette'
import { useQuickAdd, type QuickKind } from './QuickAdd'
import { useApp } from './AppContext'
import { useReminderNotifications } from '@/modules/events/useReminders'
import { useSubscriptionAutoRefresh } from '@/modules/events/useAutoRefresh'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, color: 'var(--accent)' },
  { to: '/learning', label: 'Learning Hub', icon: GraduationCap, color: 'var(--learning)' },
  { to: '/spending', label: 'Spending Control', icon: Wallet, color: 'var(--spending)' },
  { to: '/wealth', label: 'Wealth Tracker', icon: TrendingUp, color: 'var(--wealth)' },
  { to: '/events', label: 'Events Calendar', icon: CalendarDays, color: 'var(--events)' },
]

const QUICK: { kind: QuickKind; label: string }[] = [
  { kind: 'task', label: 'Task' },
  { kind: 'session', label: 'Learning session' },
  { kind: 'expense', label: 'Expense' },
  { kind: 'income', label: 'Income' },
  { kind: 'invEntry', label: 'Investment entry' },
  { kind: 'event', label: 'Event' },
]

function SaveIndicator() {
  const s = useSaveStatus()
  if (s.lastError)
    return (
      <span className="flex items-center gap-1.5 text-xs text-bad-fg" title={s.lastError} role="status">
        <CircleAlert className="h-3.5 w-3.5" /> Save failed
      </span>
    )
  if (s.pending > 0)
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" role="status" title="All changes are stored in this browser (IndexedDB)">
      <Check className="h-3.5 w-3.5 text-good-fg" /> {s.lastSavedAt ? 'Saved' : 'Stored locally'}
    </span>
  )
}

function ThemeToggle() {
  const { settings } = useApp()
  const dark = settings.theme === 'system' ? !window.matchMedia('(prefers-color-scheme: light)').matches : settings.theme === 'dark'
  return (
    <Button variant="ghost" size="icon" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })} title={`Theme: ${settings.theme}`}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const trackers = useTrackers()
  const learning = trackers?.filter((t) => t.section === 'learning') ?? []
  const personal = trackers?.filter((t) => t.section === 'personal') ?? []
  const { pathname } = useLocation()
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn('group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--line)]' : 'text-fg-2 hover:bg-surface-2/60 hover:text-fg')
  const subCls = ({ isActive }: { isActive: boolean }) => cn('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors', isActive ? 'text-fg bg-surface-2/70' : 'text-muted hover:text-fg')
  const inLearning = pathname.startsWith('/learning') || learning.some((t) => pathname.startsWith(`/trackers/${t.id}`))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-3 pt-1 pb-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 shadow-[0_6px_20px_-6px_rgba(139,92,246,0.7)]">
          <Sparkles className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-fg">Personal HQ</div>
          <div className="text-[11px] text-muted">Your operating system</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main">
        {NAV.map((n) => (
          <div key={n.to}>
            <NavLink to={n.to} end={n.end} className={(p) => linkCls({ isActive: p.isActive || (n.to === '/learning' && inLearning) })} onClick={onNavigate}>
              <n.icon className="h-4.5 w-4.5" style={{ color: n.color }} />
              {n.label}
            </NavLink>
            {n.to === '/learning' && inLearning && (
              <div className="mt-1 mb-2 ml-5 space-y-0.5 border-l border-line pl-3">
                {learning.map((t) => (
                  <NavLink key={t.id} to={`/trackers/${t.id}`} className={subCls} onClick={onNavigate}>
                    <TrackerIcon name={t.icon} color={t.color} boxed={false} className="h-3.5 w-3.5" />
                    <span className="truncate">{t.name}</span>
                  </NavLink>
                ))}
                <NavLink to="/trackers/new?section=learning" className={subCls} onClick={onNavigate}>
                  <Plus className="h-3.5 w-3.5" /> New tracker
                </NavLink>
              </div>
            )}
          </div>
        ))}
        <div className="pt-5 pb-1.5 pl-3 text-[11px] font-medium tracking-wide text-muted uppercase">Collections</div>
        {personal.map((t) => (
          <NavLink key={t.id} to={`/trackers/${t.id}`} className={linkCls} onClick={onNavigate}>
            <TrackerIcon name={t.icon} color={t.color} boxed={false} className="h-4.5 w-4.5" />
            <span className="truncate">{t.name}</span>
          </NavLink>
        ))}
        <NavLink to="/trackers" end className={linkCls} onClick={onNavigate}>
          <Layers className="h-4.5 w-4.5 text-muted" />
          All trackers
        </NavLink>
        <NavLink to="/settings" className={linkCls} onClick={onNavigate}>
          <SettingsIcon className="h-4.5 w-4.5 text-muted" />
          Settings
        </NavLink>
      </nav>
      <div className="mt-4 rounded-2xl border border-line bg-gradient-to-br from-[var(--accent-soft)] to-transparent p-3.5">
        <p className="text-xs font-medium text-fg">Local-first & private</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Data lives in this browser. Back it up regularly from Settings.</p>
        <NavLink to="/settings#backup" onClick={onNavigate} className="mt-2 inline-block text-[11px] font-medium text-accent hover:underline">
          Backup & restore →
        </NavLink>
      </div>
    </div>
  )
}

function QuickAddMenu() {
  const [open, setOpen] = useState(false)
  const quick = useQuickAdd()
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])
  return (
    <div className="relative">
      <Button
        variant="primary"
        size="md"
        icon={<Plus className="h-4 w-4" />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        <span className="hidden sm:inline">Add</span>
      </Button>
      {open && (
        <div role="menu" className="animate-fade-up absolute right-0 z-40 mt-2 w-52 rounded-xl border border-line-strong bg-surface p-1.5 shadow-2xl">
          {QUICK.map((q) => (
            <button key={q.kind} role="menuitem" className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-fg-2 hover:bg-surface-2 hover:text-fg" onClick={() => quick(q.kind)}>
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DemoBanner() {
  const n = useDemoCount()
  const navigate = useNavigate()
  if (!n) return null
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-xs text-fg-2">
      <span>
        <strong className="text-warn">Demo data is loaded</strong> ({n} sample rows, marked “[Demo]”). It is included in totals until you remove it.
      </span>
      <button className="font-medium text-warn hover:underline" onClick={() => navigate('/settings#data')}>
        Remove demo data →
      </button>
    </div>
  )
}

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()
  useReminderNotifications()
  useSubscriptionAutoRefresh()

  useEffect(() => setDrawer(false), [location.pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const mobileNav = [
    { to: '/', icon: LayoutDashboard, label: 'Home', end: true },
    { to: '/learning', icon: GraduationCap, label: 'Learn' },
    { to: '/spending', icon: Wallet, label: 'Spend' },
    { to: '/wealth', icon: TrendingUp, label: 'Wealth' },
    { to: '/events', icon: CalendarDays, label: 'Events' },
  ]

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only z-50 rounded-lg bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface/60 px-3 py-5 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="animate-fade-up absolute inset-y-0 left-0 w-72 border-r border-line bg-surface px-3 py-5">
            <Button variant="ghost" size="icon-sm" className="absolute top-4 right-3" onClick={() => setDrawer(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </Button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-xl border border-line bg-surface-2/70 px-3 text-sm text-muted transition-colors hover:border-line-strong"
              aria-label="Search everything"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 truncate text-left">Search everything…</span>
              <span className="hidden sm:inline">
                <Kbd>⌘K</Kbd>
              </span>
            </button>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
              <span className="hidden md:block">
                <SaveIndicator />
              </span>
              <ThemeToggle />
              <QuickAddMenu />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] px-4 pt-6 pb-28 sm:px-6 lg:pb-12">
          <DemoBanner />
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Mobile">
        <div className="grid grid-cols-5">
          {mobileNav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium', isActive ? 'text-accent' : 'text-muted')}>
              <n.icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <button
        className="fixed right-4 bottom-20 z-30 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-xl lg:hidden"
        aria-label="Quick add or search"
        onClick={() => setPaletteOpen(true)}
      >
        <Plus className="h-5 w-5" />
      </button>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
