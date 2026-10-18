import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, CalendarDays, CheckSquare, Clock, FileText, Search, TrendingUp, Wallet, LayoutGrid, Plus } from 'lucide-react'
import { db } from '@/data/db'
import { globalSearch, type SearchKind } from '@/domain/search'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/util'
import { Kbd } from '@/components/ui/display'
import { useQuickAdd, type QuickKind } from './QuickAdd'

const KIND_META: Record<SearchKind, { label: string; icon: typeof Search }> = {
  task: { label: 'Task', icon: CheckSquare },
  session: { label: 'Session', icon: Clock },
  record: { label: 'Record', icon: FileText },
  transaction: { label: 'Transaction', icon: Wallet },
  investment: { label: 'Investment', icon: TrendingUp },
  event: { label: 'Event', icon: CalendarDays },
  tracker: { label: 'Tracker', icon: LayoutGrid },
}

const ACTIONS: { label: string; kind?: QuickKind; href?: string; keywords: string }[] = [
  { label: 'Add task', kind: 'task', keywords: 'task todo new' },
  { label: 'Log learning session', kind: 'session', keywords: 'session learning study log time' },
  { label: 'Add expense', kind: 'expense', keywords: 'expense spend transaction' },
  { label: 'Add income', kind: 'income', keywords: 'income salary transaction' },
  { label: 'Add investment entry', kind: 'invEntry', keywords: 'investment sip contribution' },
  { label: 'Update investment value', kind: 'valuation', keywords: 'valuation value portfolio' },
  { label: 'Add event', kind: 'event', keywords: 'event calendar meeting' },
  { label: 'Create a tracker', href: '/trackers/new', keywords: 'tracker new custom create' },
  { label: 'Open settings', href: '/settings', keywords: 'settings preferences theme backup' },
  { label: 'Import / export calendar', href: '/events/sync', keywords: 'ics apple calendar import export sync' },
]

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const quick = useQuickAdd()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      setQ('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
    if (!open && d.open) d.close()
  }, [open])

  const corpus = useLiveQuery(async () => {
    if (!open) return null
    const [tasks, sessions, records, trackers, transactions, investments, events] = await Promise.all([
      db.tasks.toArray(),
      db.sessions.toArray(),
      db.records.toArray(),
      db.trackers.toArray(),
      db.transactions.toArray(),
      db.investments.toArray(),
      db.events.toArray(),
    ])
    return { tasks, sessions, records, trackers, transactions, investments, events }
  }, [open])

  const results = useMemo(() => (corpus && q.trim() ? globalSearch(corpus, q, 30) : []), [corpus, q])
  const actions = useMemo(() => {
    const s = q.trim().toLowerCase()
    return ACTIONS.filter((a) => !s || a.label.toLowerCase().includes(s) || a.keywords.includes(s)).slice(0, s ? 4 : 10)
  }, [q])

  type Item = { key: string; run: () => void }
  const items: Item[] = [
    ...actions.map((a) => ({
      key: 'a' + a.label,
      run: () => {
        onClose()
        if (a.kind) quick(a.kind)
        else if (a.href) navigate(a.href)
      },
    })),
    ...results.map((r) => ({
      key: r.kind + r.id,
      run: () => {
        onClose()
        navigate(r.href)
      },
    })),
  ]

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[active]?.run()
    }
  }

  useEffect(() => {
    document.getElementById(`cmd-item-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  let idx = -1
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="mx-auto mt-[10vh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-2xl"
      aria-label="Search and commands"
    >
      {open && (
        <div onKeyDown={onKey}>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="h-4 w-4 text-muted" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setActive(0)
              }}
              placeholder="Search tasks, sessions, transactions, investments, events…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="cmd-list"
              aria-activedescendant={`cmd-item-${active}`}
            />
            <Kbd>Esc</Kbd>
          </div>
          <div id="cmd-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {actions.length > 0 && <div className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Quick actions</div>}
            {actions.map((a) => {
              idx++
              const i = idx
              return (
                <button
                  key={a.label}
                  id={`cmd-item-${i}`}
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => items[i].run()}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm', active === i ? 'bg-surface-2 text-fg' : 'text-fg-2')}
                >
                  <Plus className="h-4 w-4 text-muted" />
                  {a.label}
                </button>
              )
            })}
            {q.trim() && (
              <div className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{results.length ? `Results (${results.length})` : 'No matching records'}</div>
            )}
            {results.map((r) => {
              idx++
              const i = idx
              const M = KIND_META[r.kind]
              return (
                <button
                  key={r.kind + r.id}
                  id={`cmd-item-${i}`}
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => items[i].run()}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', active === i ? 'bg-surface-2' : '')}
                >
                  <M.icon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{r.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {M.label} · {r.subtitle}
                      {r.date ? ` · ${formatDate(r.date)}` : ''}
                    </span>
                  </span>
                  {active === i && <ArrowRight className="h-4 w-4 text-muted" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </dialog>
  )
}
