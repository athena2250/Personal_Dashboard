import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, Trash2, Clock } from 'lucide-react'
import type { LearningSession, Tracker } from '@/data/models'
import { deleteSession } from '@/data/repos/trackers'
import { periodRange, shiftPeriod, sumMinutes, type PeriodView } from '@/domain/activity'
import { Button } from '@/components/ui/Button'
import { Badge, Card, EmptyState, Segmented } from '@/components/ui/display'
import { Input, Select } from '@/components/ui/forms'
import { TrackerIcon } from '@/components/ui/Icon'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { SessionFormModal } from '@/modules/learning/SessionForm'
import { useApp } from '@/app/AppContext'
import { formatDate, formatMinutes, relativeDays } from '@/lib/dates'
import { isSafeUrl, cn } from '@/lib/util'
import { exportSessionsCsv } from './exportRecords'

type Sort = 'date-desc' | 'date-asc' | 'minutes-desc' | 'title'

export function periodLabel(view: PeriodView | 'all', from: string, to: string) {
  if (view === 'day') return formatDate(from, 'long')
  if (view === 'week') return `${formatDate(from, 'short')} – ${formatDate(to, 'medium')}`
  if (view === 'month') return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(from + 'T00:00:00Z'))
  return 'All time'
}

export function SessionLog({ sessions, trackers, trackerId, highlightId, title = 'Activity log' }: { sessions: LearningSession[]; trackers: Tracker[]; trackerId?: string; highlightId?: string | null; title?: string }) {
  const { today, settings } = useApp()
  const confirm = useConfirm()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [view, setView] = useState<PeriodView | 'all'>('all')
  const [anchor, setAnchor] = useState(today)
  const [sort, setSort] = useState<Sort>('date-desc')
  const [filterTracker, setFilterTracker] = useState('')
  const tracker = trackerId ? trackers.find((t) => t.id === trackerId) : undefined
  const filterField = tracker?.sessionFields.find((f) => f.type === 'select')
  const [attrFilter, setAttrFilter] = useState('')
  const [limit, setLimit] = useState(50)
  const [editing, setEditing] = useState<LearningSession | undefined>()
  const [adding, setAdding] = useState(false)
  const byId = useMemo(() => new Map(trackers.map((t) => [t.id, t])), [trackers])

  const range = view === 'all' ? null : periodRange(view, anchor, settings.weekStartsOn)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    let list = sessions.filter((x) => {
      if (range && (x.date < range.from || x.date > range.to)) return false
      if (filterTracker && x.trackerId !== filterTracker) return false
      if (filterField && attrFilter && String(x.attrs?.[filterField.id] ?? '') !== attrFilter) return false
      if (s) {
        const hay = [x.title, x.notes, ...Object.values(x.attrs ?? {}).map(String)].join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
        case 'minutes-desc':
          return b.minutes - a.minutes
        case 'title':
          return a.title.localeCompare(b.title)
        default:
          return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      }
    })
    return list
  }, [sessions, q, range?.from, range?.to, filterTracker, attrFilter, filterField, sort])

  const remove = async (s: LearningSession) => {
    if (!(await confirm({ title: 'Delete session?', message: `"${s.title}" (${formatMinutes(s.minutes)} on ${formatDate(s.date)}) will be removed and your stats recalculated.`, confirmLabel: 'Delete', danger: true }))) return
    deleteSession(s.id)
      .then(() => toast.success('Session deleted'))
      .catch(toast.error)
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
            <p className="text-xs text-muted">
              {filtered.length} session{filtered.length === 1 ? '' : 's'} · {formatMinutes(sumMinutes(filtered))}
              {tracker?.countLabel ? ` · ${filtered.reduce((s, x) => s + (x.count || 0), 0)} ${tracker.countLabel.toLowerCase()}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportSessionsCsv(filtered, trackers, tracker ? `${tracker.name}-log` : 'learning-log')} disabled={!filtered.length}>
              Export CSV
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>
              Log session
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions…" className="pl-9" aria-label="Search sessions" />
          </div>
          <Segmented
            size="sm"
            value={view}
            onChange={(v) => {
              setView(v)
              setAnchor(today)
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
          {range && (
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" aria-label="Previous period" onClick={() => setAnchor(shiftPeriod(view as PeriodView, anchor, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[120px] text-center text-xs font-medium text-fg-2">{periodLabel(view, range.from, range.to)}</span>
              <Button size="icon-sm" variant="ghost" aria-label="Next period" onClick={() => setAnchor(shiftPeriod(view as PeriodView, anchor, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          {!trackerId && (
            <Select value={filterTracker} onChange={(e) => setFilterTracker(e.target.value)} className="w-auto" aria-label="Filter by tracker">
              <option value="">All trackers</option>
              {trackers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
          {filterField && (
            <Select value={attrFilter} onChange={(e) => setAttrFilter(e.target.value)} className="w-auto" aria-label={`Filter by ${filterField.name}`}>
              <option value="">All {filterField.name.toLowerCase()}s</option>
              {filterField.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          )}
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto" aria-label="Sort">
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="minutes-desc">Longest first</option>
            <option value="title">Title A–Z</option>
          </Select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-5 w-5" />}
          title={sessions.length ? 'No sessions match these filters' : 'No sessions logged yet'}
          description={sessions.length ? 'Try a different period or search.' : 'Log your first session to start your streak.'}
          action={!sessions.length && <Button size="sm" onClick={() => setAdding(true)}>Log a session</Button>}
        />
      ) : (
        <ul className="divide-y divide-line">
          {filtered.slice(0, limit).map((s) => {
            const t = byId.get(s.trackerId)
            const fields = t?.sessionFields ?? []
            return (
              <li key={s.id} className={cn('group flex items-start gap-3 px-4 py-3', highlightId === s.id && 'bg-accent-soft')}>
                {!trackerId && t && <TrackerIcon name={t.icon} color={t.color} size="sm" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-fg">{s.title}</span>
                    {s.demo && <Badge tone="warn">Demo</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{relativeDays(s.date, today)}</span>
                    {!trackerId && t && <span>· {t.name}</span>}
                    {fields
                      .filter((f) => s.attrs?.[f.id] != null && s.attrs[f.id] !== '' && f.type !== 'url')
                      .map((f) => (
                        <Badge key={f.id}>{f.type === 'number' ? `${f.name}: ${s.attrs[f.id]}` : String(s.attrs[f.id])}</Badge>
                      ))}
                    {fields
                      .filter((f) => f.type === 'url' && isSafeUrl(String(s.attrs?.[f.id] ?? '')))
                      .map((f) => (
                        <a key={f.id} href={String(s.attrs[f.id])} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          link ↗
                        </a>
                      ))}
                  </div>
                  {s.notes && <p className="mt-1 line-clamp-2 text-xs text-fg-2">{s.notes}</p>}
                </div>
                <div className="text-right">
                  <div className="tabular text-sm font-medium text-fg">{formatMinutes(s.minutes)}</div>
                  {s.count ? <div className="text-[11px] text-muted">{s.count} {t?.countLabel ? t.countLabel.toLowerCase() : ''}</div> : null}
                </div>
                <div className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                  <Button variant="ghost" size="icon-sm" aria-label="Edit session" onClick={() => setEditing(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete session" onClick={() => remove(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {filtered.length > limit && (
        <div className="border-t border-line p-3 text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 100)}>
            Show more ({filtered.length - limit} remaining)
          </Button>
        </div>
      )}
      <SessionFormModal open={adding || !!editing} onClose={() => { setAdding(false); setEditing(undefined) }} session={editing} trackerId={trackerId} />
    </Card>
  )
}
