import { useMemo, useState } from 'react'
import { ArrowDownUp, CalendarDays, ChevronLeft, ChevronRight, Download, LayoutGrid, List, Plus, Search, Flag, CheckCircle2 } from 'lucide-react'
import type { Tracker, TrackerRecord, TrackerView, LearningSession } from '@/data/models'
import { updateRecord } from '@/data/repos/trackers'
import { Button } from '@/components/ui/Button'
import { Badge, Card, EmptyState, ProgressBar, Segmented } from '@/components/ui/display'
import { Input, Select } from '@/components/ui/forms'
import { FieldValue } from '@/components/FieldInput'
import { useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { addMonthKey, dayOfWeek, daysInMonth, formatDate, formatMinutes, makeDate, monthKey, relativeDays, weekdayShort } from '@/lib/dates'
import { cn } from '@/lib/util'
import { RecordFormModal } from './RecordForm'
import { exportRecordsCsv } from './exportRecords'

type SortKey = 'updated' | 'title' | 'deadline' | 'progress' | 'status'

export function RecordsView({ tracker, records, sessions, openRecordId, onOpened }: { tracker: Tracker; records: TrackerRecord[]; sessions: LearningSession[]; openRecordId?: string | null; onOpened?: () => void }) {
  const { today, currency } = useApp()
  const toast = useToast()
  const [view, setView] = useState<TrackerView>(tracker.view)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [editing, setEditing] = useState<TrackerRecord | undefined>()
  const [adding, setAdding] = useState<Partial<TrackerRecord> | null>(null)
  const label = tracker.recordLabel || 'Item'
  const statusById = new Map(tracker.statuses.map((s) => [s.id, s]))
  const minutesByRecord = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sessions) if (s.recordId) m.set(s.recordId, (m.get(s.recordId) ?? 0) + s.minutes)
    return m
  }, [sessions])

  if (openRecordId && !editing) {
    const r = records.find((x) => x.id === openRecordId)
    if (r) {
      setEditing(r)
      onOpened?.()
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const statusOrder = new Map(tracker.statuses.map((x, i) => [x.id, i]))
    return records
      .filter((r) => (!status || r.status === status) && (!category || r.category === category))
      .filter((r) => !s || [r.title, r.notes, r.category, ...Object.values(r.values ?? {}).map((v) => (typeof v === 'string' ? v : ''))].join(' ').toLowerCase().includes(s))
      .sort((a, b) => {
        switch (sort) {
          case 'title':
            return a.title.localeCompare(b.title)
          case 'deadline':
            return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')
          case 'progress':
            return (b.progress ?? -1) - (a.progress ?? -1)
          case 'status':
            return (statusOrder.get(a.status ?? '') ?? 99) - (statusOrder.get(b.status ?? '') ?? 99)
          default:
            return b.updatedAt.localeCompare(a.updatedAt)
        }
      })
  }, [records, q, status, category, sort, tracker.statuses])

  const tableFields = tracker.fields.filter((f) => f.showInTable !== false && f.type !== 'longtext').slice(0, 4)
  const toggleMilestone = (r: TrackerRecord, id: string) => updateRecord(r.id, { milestones: r.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)) }).catch(toast.error)

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-fg">{label}s</h3>
            <p className="text-xs text-muted">
              {filtered.length} of {records.length}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'table', label: <span className="flex items-center gap-1"><List className="h-3.5 w-3.5" /> Table</span> },
                { value: 'cards', label: <span className="flex items-center gap-1"><LayoutGrid className="h-3.5 w-3.5" /> Cards</span> },
                { value: 'calendar', label: <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Calendar</span> },
              ]}
            />
            <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportRecordsCsv(filtered, tracker)} disabled={!filtered.length}>
              CSV
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding({})}>
              Add {label.toLowerCase()}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}s…`} className="pl-9" aria-label="Search" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Filter status">
            <option value="">All statuses</option>
            {tracker.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          {tracker.categories.length > 0 && (
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto" aria-label="Filter category">
              <option value="">All categories</option>
              {tracker.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
          <div className="flex items-center gap-1.5">
            <ArrowDownUp className="h-3.5 w-3.5 text-muted" />
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-auto" aria-label="Sort">
              <option value="updated">Recently updated</option>
              <option value="title">Title</option>
              <option value="deadline">Deadline</option>
              <option value="progress">Progress</option>
              <option value="status">Status</option>
            </Select>
          </div>
        </div>
      </div>

      {records.length === 0 ? (
        <EmptyState icon={<Plus className="h-5 w-5" />} title={`No ${label.toLowerCase()}s yet`} description={`Add your first ${label.toLowerCase()} to track status, progress, deadlines and milestones.`} action={<Button size="sm" onClick={() => setAdding({})}>Add {label.toLowerCase()}</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState compact title="Nothing matches these filters" />
      ) : view === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                {tracker.categories.length > 0 && <th className="px-3 py-2.5 font-medium">Category</th>}
                {tableFields.map((f) => (
                  <th key={f.id} className="px-3 py-2.5 font-medium">
                    {f.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 font-medium">Progress</th>
                <th className="px-3 py-2.5 font-medium">Deadline</th>
                <th className="px-4 py-2.5 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => {
                const st = statusById.get(r.status ?? '')
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setEditing(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(r)}>
                    <td className="px-4 py-2.5 font-medium text-fg">
                      {r.title}
                      {r.demo && <Badge tone="warn" className="ml-2">Demo</Badge>}
                    </td>
                    <td className="px-3 py-2.5">{st ? <Badge color={st.color}>{st.name}</Badge> : <span className="text-muted">—</span>}</td>
                    {tracker.categories.length > 0 && <td className="px-3 py-2.5 text-fg-2">{r.category ?? '—'}</td>}
                    {tableFields.map((f) => (
                      <td key={f.id} className="px-3 py-2.5 text-fg-2">
                        <FieldValue field={f} value={r.values?.[f.id]} currency={currency} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      {r.progress != null ? (
                        <div className="flex items-center gap-2">
                          <ProgressBar value={r.progress / 100} color={tracker.color} className="w-16" />
                          <span className="tabular text-xs text-muted">{r.progress}%</span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={cn('px-3 py-2.5 text-xs', r.deadline && r.deadline < today && !st?.done ? 'text-bad-fg' : 'text-fg-2')}>{r.deadline ? relativeDays(r.deadline, today) : '—'}</td>
                    <td className="tabular px-4 py-2.5 text-right text-xs text-fg-2">{minutesByRecord.get(r.id) ? formatMinutes(minutesByRecord.get(r.id)!) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const st = statusById.get(r.status ?? '')
            const next = r.milestones.find((m) => !m.done)
            return (
              <article key={r.id} className="flex flex-col rounded-xl border border-line bg-surface-2/40 p-4 transition-colors hover:border-line-strong">
                <button className="text-left" onClick={() => setEditing(r)}>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-fg">{r.title}</h4>
                    {st && <Badge color={st.color}>{st.name}</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                    {r.category && <span>{r.category}</span>}
                    {r.demo && <Badge tone="warn">Demo</Badge>}
                    {minutesByRecord.get(r.id) ? <span>· {formatMinutes(minutesByRecord.get(r.id)!)} logged</span> : null}
                  </div>
                  <dl className="mt-3 space-y-1 text-xs">
                    {tracker.fields
                      .filter((f) => r.values?.[f.id] != null && r.values[f.id] !== '')
                      .slice(0, 4)
                      .map((f) => (
                        <div key={f.id} className="flex gap-2">
                          <dt className="w-24 shrink-0 text-muted">{f.name}</dt>
                          <dd className="min-w-0 text-fg-2">
                            <FieldValue field={f} value={r.values[f.id]} currency={currency} />
                          </dd>
                        </div>
                      ))}
                  </dl>
                </button>
                {r.progress != null && (
                  <div className="mt-3 flex items-center gap-2">
                    <ProgressBar value={r.progress / 100} color={tracker.color} />
                    <span className="tabular text-xs text-muted">{r.progress}%</span>
                  </div>
                )}
                {r.milestones.length > 0 && (
                  <div className="mt-3 border-t border-line pt-2">
                    <p className="text-[11px] text-muted">
                      Milestones {r.milestones.filter((m) => m.done).length}/{r.milestones.length}
                    </p>
                    {next && (
                      <button className="mt-1 flex items-center gap-1.5 text-left text-xs text-fg-2 hover:text-fg" onClick={() => toggleMilestone(r, next.id)} title="Mark next milestone done">
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted" /> Next: {next.title}
                        {next.due && <span className="text-muted">· {formatDate(next.due, 'short')}</span>}
                      </button>
                    )}
                  </div>
                )}
                {r.deadline && (
                  <p className={cn('mt-2 flex items-center gap-1 text-xs', r.deadline < today && !st?.done ? 'text-bad-fg' : 'text-muted')}>
                    <Flag className="h-3 w-3" /> Due {relativeDays(r.deadline, today)}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <RecordsCalendar tracker={tracker} records={filtered} onOpen={setEditing} onAdd={(date) => setAdding({ deadline: date })} />
      )}
      <RecordFormModal open={!!editing || !!adding} onClose={() => { setEditing(undefined); setAdding(null) }} tracker={tracker} record={editing} preset={adding ?? undefined} />
    </Card>
  )
}

/** Month grid placing records on their deadline (or first date field). */
function RecordsCalendar({ tracker, records, onOpen, onAdd }: { tracker: Tracker; records: TrackerRecord[]; onOpen: (r: TrackerRecord) => void; onAdd: (date: string) => void }) {
  const { today, settings } = useApp()
  const [month, setMonth] = useState(monthKey(today))
  const dateField = tracker.fields.find((f) => f.type === 'date')
  const dateOf = (r: TrackerRecord) => r.deadline ?? r.date ?? (dateField ? (r.values?.[dateField.id] as string | undefined) : undefined)
  const [y, m] = month.split('-').map(Number)
  const first = makeDate(y, m, 1)
  const offset = (dayOfWeek(first) - settings.weekStartsOn + 7) % 7
  const dim = daysInMonth(y, m)
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: dim }, (_, i) => makeDate(y, m, i + 1))]
  while (cells.length % 7) cells.push(null)
  const undated = records.filter((r) => !dateOf(r))
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonthKey(month, -1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-fg">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(first + 'T00:00:00Z'))}</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonthKey(month, 1))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line text-xs">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="bg-surface-2 py-1.5 text-center font-medium text-muted">
            {weekdayShort((i + settings.weekStartsOn) % 7)}
          </div>
        ))}
        {cells.map((d, i) => (
          <div key={i} className={cn('min-h-[78px] bg-surface p-1.5', !d && 'bg-surface-2/40')} onDoubleClick={() => d && onAdd(d)}>
            {d && (
              <>
                <div className={cn('mb-1 text-[11px]', d === today ? 'font-semibold text-accent' : 'text-muted')}>{Number(d.slice(8))}</div>
                {records
                  .filter((r) => dateOf(r) === d)
                  .map((r) => (
                    <button key={r.id} onClick={() => onOpen(r)} className="mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-fg" style={{ background: `color-mix(in oklab, ${tracker.color} 22%, transparent)` }}>
                      {r.title}
                    </button>
                  ))}
              </>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">Placed by deadline{dateField ? ` or “${dateField.name}”` : ''}. Double-click a day to add.</p>
      {undated.length > 0 && <p className="mt-1 text-[11px] text-muted">{undated.length} item(s) without a date aren't shown.</p>}
    </div>
  )
}
