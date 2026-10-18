import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CalendarDays, ChevronLeft, ChevronRight, Lock, MapPin, Pencil, Plus, RefreshCw, Repeat, Search, Trash2, Bell, Link2 } from 'lucide-react'
import type { CalendarEvent } from '@/data/models'
import { useCalendarSources, useEvents, useTrackers } from '@/data/hooks'
import { deleteEvent, excludeOccurrence } from '@/data/repos/events'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, Card, EmptyState, Loading, PageHeader, Segmented } from '@/components/ui/display'
import { Input } from '@/components/ui/forms'
import { Modal } from '@/components/ui/Modal'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { addDays, addMonthKey, dayOfWeek, daysInMonth, formatDate, makeDate, monthKey, relativeDays, startOfWeek, weekdayShort, type ISODate } from '@/lib/dates'
import { formatClock, formatTime, getAppTimezone, zonedParts } from '@/lib/tz'
import { describeRRule } from '@/domain/rrule'
import { cn } from '@/lib/util'
import { buildInstances, type EventInstance } from './calendarModel'
import { EventFormModal, REMINDER_CHOICES } from './EventForm'

type View = 'month' | 'week' | 'day' | 'agenda'
const HOUR_PX = 48

export function EventsPage() {
  const { today, settings } = useApp()
  const events = useEvents()
  const sources = useCalendarSources()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? 'agenda' : 'month'))
  const [anchor, setAnchor] = useState<ISODate>(params.get('date') ?? today)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<EventInstance | null>(null)
  const [creating, setCreating] = useState<{ date: string; time?: string } | null>(null)
  const [editing, setEditing] = useState<CalendarEvent | undefined>()
  const tz = getAppTimezone()
  const cats = settings.eventCategories

  const range = useMemo(() => {
    if (view === 'day') return { from: anchor, to: anchor }
    if (view === 'week') {
      const from = startOfWeek(anchor, settings.weekStartsOn)
      return { from, to: addDays(from, 6) }
    }
    if (view === 'agenda') return { from: anchor, to: addDays(anchor, 60) }
    const [y, m] = anchor.split('-').map(Number)
    const first = makeDate(y, m, 1)
    const from = startOfWeek(first, settings.weekStartsOn)
    const last = makeDate(y, m, daysInMonth(y, m))
    return { from, to: addDays(startOfWeek(last, settings.weekStartsOn), 6) }
  }, [view, anchor, settings.weekStartsOn])

  const instances = useMemo(() => {
    if (!events) return []
    const s = q.trim().toLowerCase()
    const filtered = events.filter((e) => !hidden.has(e.category) && (!s || [e.title, e.description, e.location].join(' ').toLowerCase().includes(s)))
    return buildInstances(filtered, range.from, range.to, tz, cats)
  }, [events, hidden, q, range, tz, cats])

  // Deep link: /events?event=<id>&date=<d>
  const linkedId = params.get('event')
  useEffect(() => {
    if (!linkedId || !events) return
    const e = events.find((x) => x.id === linkedId)
    if (!e) return
    const date = params.get('date') ?? (e.allDay ? e.start : e.start.slice(0, 10))
    const inst = buildInstances([e], date, addDays(date, 1), tz, cats)[0] ?? buildInstances([e], e.allDay ? e.start : date, addDays(date, 400), tz, cats)[0]
    if (inst) {
      setSelected(inst)
      setAnchor(inst.startDate)
    }
    setParams({}, { replace: true })
  }, [linkedId, events])

  if (!events || !sources) return <Loading />

  const nav = (dir: -1 | 1) => {
    if (view === 'month') setAnchor(addMonthKey(monthKey(anchor), dir) + '-01')
    else if (view === 'week') setAnchor(addDays(anchor, 7 * dir))
    else if (view === 'agenda') setAnchor(addDays(anchor, 30 * dir))
    else setAnchor(addDays(anchor, dir))
  }
  const title =
    view === 'month'
      ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(anchor + 'T00:00:00Z'))
      : view === 'week'
        ? `${formatDate(range.from, 'short')} – ${formatDate(range.to)}`
        : view === 'agenda'
          ? `From ${formatDate(anchor)}`
          : formatDate(anchor, 'long')

  const subErrors = sources.filter((s) => s.lastError)

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Dashboard"
        title="Events Calendar"
        subtitle="Work, conferences, dev events, exams and deadlines. Apple Calendar via ICS import/export and read-only subscriptions."
        icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-events-soft text-events"><CalendarDays className="h-6 w-6" /></span>}
        actions={
          <>
            <ButtonLink to="/events/sync" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Apple Calendar & ICS
            </ButtonLink>
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating({ date: view === 'month' && monthKey(anchor) !== monthKey(today) ? anchor : today })}>
              New event
            </Button>
          </>
        }
      />
      {subErrors.length > 0 && (
        <div className="mb-4 rounded-xl border border-bad/30 bg-bad/10 px-4 py-2.5 text-sm text-fg" role="alert">
          Sync problem with {subErrors.map((s) => s.name).join(', ')}: {subErrors[0].lastError} <Link to="/events/sync" className="ml-1 font-medium text-bad-fg hover:underline">Details →</Link>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Previous" onClick={() => nav(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next" onClick={() => nav(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold text-fg">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events" className="w-48 pl-9" aria-label="Search events" />
          </div>
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
              { value: 'agenda', label: 'List' },
            ]}
          />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {cats.map((c) => {
          const off = hidden.has(c.id)
          return (
            <button
              key={c.id}
              aria-pressed={!off}
              onClick={() => {
                const next = new Set(hidden)
                if (off) next.delete(c.id)
                else next.add(c.id)
                setHidden(next)
              }}
              className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity', off ? 'border-line text-muted opacity-60' : 'border-line-strong text-fg-2')}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: off ? 'var(--muted)' : c.color }} />
              {c.name}
            </button>
          )
        })}
      </div>

      <Card className="overflow-hidden">
        {view === 'month' && <MonthGrid anchor={anchor} range={range} instances={instances} today={today} weekStartsOn={settings.weekStartsOn} onSelect={setSelected} onCreate={(d) => setCreating({ date: d })} onDay={(d) => { setAnchor(d); setView('day') }} />}
        {(view === 'week' || view === 'day') && <TimeGrid days={view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(range.from, i)) : [anchor]} instances={instances} today={today} onSelect={setSelected} onCreate={(d, t) => setCreating({ date: d, time: t })} />}
        {view === 'agenda' && <Agenda instances={instances} today={today} onSelect={setSelected} />}
      </Card>
      {events.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted">
          No events yet. Click a day to add one, or <Link to="/events/sync" className="text-accent hover:underline">import from Apple Calendar</Link>.
        </p>
      )}

      <EventDetail instance={selected} onClose={() => setSelected(null)} onEdit={(e) => { setSelected(null); setEditing(e) }} sources={sources} />
      <EventFormModal open={!!creating} onClose={() => setCreating(null)} presetDate={creating?.date} presetTime={creating?.time} />
      <EventFormModal open={!!editing} onClose={() => setEditing(undefined)} event={editing} />
    </div>
  )
}

function Chip({ i, onSelect, compact }: { i: EventInstance; onSelect: (i: EventInstance) => void; compact?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onSelect(i)
      }}
      className={cn('flex w-full items-center gap-1 truncate rounded-md px-1.5 text-left text-[11px] leading-5 text-fg transition-[filter] hover:brightness-125', compact && 'py-0')}
      style={{ background: i.allDay ? `color-mix(in oklab, ${i.color} 30%, transparent)` : 'transparent' }}
      title={i.event.title}
    >
      {!i.allDay && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: i.color }} />}
      {!i.allDay && <span className="shrink-0 text-muted">{formatClock(i.startTime!)}</span>}
      <span className="truncate">{i.event.title}</span>
    </button>
  )
}

function MonthGrid({ anchor, range, instances, today, weekStartsOn, onSelect, onCreate, onDay }: { anchor: string; range: { from: string; to: string }; instances: EventInstance[]; today: string; weekStartsOn: 0 | 1; onSelect: (i: EventInstance) => void; onCreate: (d: string) => void; onDay: (d: string) => void }) {
  const days: string[] = []
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d)
  const m = monthKey(anchor)
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="py-2 text-center text-xs font-medium text-muted">
            {weekdayShort((i + weekStartsOn) % 7)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = instances.filter((i) => i.startDate <= d && i.endDate >= d)
          const out = monthKey(d) !== m
          return (
            <div
              key={d}
              role="gridcell"
              className={cn('group min-h-[92px] cursor-pointer border-r border-b border-line p-1 sm:min-h-[112px]', out && 'bg-surface-2/40', dayOfWeek(d) === (weekStartsOn + 6) % 7 && 'border-r-0')}
              onClick={() => onCreate(d)}
              aria-label={formatDate(d, 'long')}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDay(d)
                  }}
                  className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs', d === today ? 'bg-[var(--events)] font-semibold text-white' : out ? 'text-muted' : 'text-fg-2 hover:bg-surface-3')}
                >
                  {Number(d.slice(8))}
                </button>
                <Plus className="h-3.5 w-3.5 text-muted opacity-0 group-hover:opacity-100" aria-hidden />
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((i) => (
                  <Chip key={i.key} i={i} onSelect={onSelect} compact />
                ))}
                {list.length > 3 && (
                  <button
                    className="px-1.5 text-[11px] text-muted hover:text-fg"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDay(d)
                    }}
                  >
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function minutesOf(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function TimeGrid({ days, instances, today, onSelect, onCreate }: { days: string[]; instances: EventInstance[]; today: string; onSelect: (i: EventInstance) => void; onCreate: (d: string, t: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7.5 * HOUR_PX
  }, [])
  return (
    <div>
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d} className="py-2 text-center">
            <div className="text-[11px] text-muted">{weekdayShort(dayOfWeek(d))}</div>
            <div className={cn('mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm', d === today ? 'bg-[var(--events)] font-semibold text-white' : 'text-fg')}>{Number(d.slice(8))}</div>
          </div>
        ))}
      </div>
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="py-1 pr-2 text-right text-[10px] text-muted">all-day</div>
        {days.map((d) => (
          <div key={d} className="min-h-[28px] space-y-0.5 border-l border-line p-0.5">
            {instances
              .filter((i) => i.allDay && i.startDate <= d && i.endDate >= d)
              .map((i) => (
                <Chip key={i.key} i={i} onSelect={onSelect} />
              ))}
          </div>
        ))}
      </div>
      <div ref={scroller} className="relative max-h-[640px] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative pr-2 text-right text-[10px] text-muted" style={{ height: HOUR_PX }}>
                <span className="relative -top-1.5">{h === 0 ? '' : formatClock(`${String(h).padStart(2, '0')}:00`)}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const timed = instances.filter((i) => !i.allDay && i.startDate <= d && i.endDate >= d)
            // simple overlap columns
            const placed: { i: EventInstance; top: number; height: number; col: number }[] = []
            for (const i of timed) {
              const start = i.startDate < d ? 0 : minutesOf(i.startTime!)
              const end = i.endDate > d ? 1440 : Math.max(start + 20, minutesOf(i.endTime!) || 1440)
              let col = 0
              while (placed.some((p) => p.col === col && p.top < end && p.top + p.height > start)) col++
              placed.push({ i, top: start, height: end - start, col })
            }
            const cols = Math.max(1, ...placed.map((p) => p.col + 1))
            return (
              <div key={d} className="relative border-l border-line">
                {Array.from({ length: 24 }, (_, h) => (
                  <button key={h} className="block w-full border-b border-line/60 hover:bg-surface-2/50" style={{ height: HOUR_PX }} onClick={() => onCreate(d, `${String(h).padStart(2, '0')}:00`)} aria-label={`New event ${formatDate(d)} ${h}:00`} />
                ))}
                {d === today && <NowLine />}
                {placed.map((p) => (
                  <button
                    key={p.i.key}
                    onClick={() => onSelect(p.i)}
                    className="absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight text-fg shadow-sm hover:brightness-125"
                    style={{
                      top: (p.top / 60) * HOUR_PX,
                      height: Math.max(18, (p.height / 60) * HOUR_PX - 2),
                      left: `calc(${(p.col / cols) * 100}% + 2px)`,
                      width: `calc(${100 / cols}% - 4px)`,
                      background: `color-mix(in oklab, ${p.i.color} 26%, var(--surface))`,
                      borderColor: p.i.color,
                    }}
                  >
                    <div className="truncate font-medium">{p.i.event.title}</div>
                    <div className="truncate text-muted">
                      {formatClock(p.i.startTime!)} – {formatClock(p.i.endTime!)}
                    </div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NowLine() {
  const tz = getAppTimezone()
  const nowMins = () => {
    const p = zonedParts(Date.now(), tz)
    return p.hour * 60 + p.minute
  }
  const [mins, setMins] = useState(nowMins)
  useEffect(() => {
    const id = setInterval(() => setMins(nowMins()), 60_000)
    return () => clearInterval(id)
  }, [tz])
  return (
    <div className="pointer-events-none absolute right-0 left-0 z-10 flex items-center" style={{ top: (mins / 60) * HOUR_PX }}>
      <span className="-ml-1 h-2 w-2 rounded-full bg-bad" />
      <span className="h-px flex-1 bg-bad" />
    </div>
  )
}

function Agenda({ instances, today, onSelect }: { instances: EventInstance[]; today: string; onSelect: (i: EventInstance) => void }) {
  const tz = getAppTimezone()
  if (!instances.length) return <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="No events in the next 60 days" />
  const byDay = new Map<string, EventInstance[]>()
  for (const i of instances) byDay.set(i.startDate, [...(byDay.get(i.startDate) ?? []), i])
  return (
    <div className="divide-y divide-line">
      {[...byDay.entries()].map(([d, list]) => (
        <div key={d} className="flex gap-4 px-4 py-3 sm:px-5">
          <div className="w-20 shrink-0 pt-0.5">
            <div className={cn('text-sm font-semibold', d === today ? 'text-events' : 'text-fg')}>{relativeDays(d, today)}</div>
            <div className="text-[11px] text-muted">{formatDate(d, 'weekday')}</div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1">
            {list.map((i) => (
              <li key={i.key}>
                <button onClick={() => onSelect(i)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: i.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{i.event.title}</span>
                    <span className="text-xs text-muted">
                      {i.allDay ? (i.endDate !== i.startDate ? `All day · until ${formatDate(i.endDate, 'short')}` : 'All day') : `${formatTime(i.start, tz)} – ${formatTime(i.end, tz)}`}
                      {i.event.location ? ` · ${i.event.location}` : ''}
                    </span>
                  </span>
                  {i.recurring && <Repeat className="h-3.5 w-3.5 text-muted" aria-label="Recurring" />}
                  {i.event.readOnly && <Lock className="h-3.5 w-3.5 text-muted" aria-label="Read-only" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function EventDetail({ instance: i, onClose, onEdit, sources }: { instance: EventInstance | null; onClose: () => void; onEdit: (e: CalendarEvent) => void; sources: { id: string; name: string; kind: string }[] }) {
  const { settings } = useApp()
  const trackers = useTrackers()
  const confirm = useConfirm()
  const toast = useToast()
  const tz = getAppTimezone()
  const e = i?.event
  const source = e?.sourceId ? sources.find((s) => s.id === e.sourceId) : undefined
  const tracker = e?.linkedTrackerId ? trackers?.find((t) => t.id === e.linkedTrackerId) : undefined
  const remove = async (scope: 'one' | 'all') => {
    if (!e || !i) return
    const ok = await confirm({ title: scope === 'one' ? 'Delete this occurrence?' : e.rrule ? 'Delete the whole series?' : 'Delete event?', message: `“${e.title}”`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try {
      if (scope === 'one') await excludeOccurrence(e.id, i.start)
      else await deleteEvent(e.id)
      toast.success('Event deleted')
      onClose()
    } catch (err) {
      toast.error(err)
    }
  }
  return (
    <Modal open={!!i} onClose={onClose} title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: i?.color }} />{e?.title}</span>} size="sm">
      {i && e && (
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5 text-fg-2">
            <p className="text-fg">
              {i.allDay
                ? i.startDate === i.endDate
                  ? `${formatDate(i.startDate, 'long')} · All day`
                  : `${formatDate(i.startDate, 'weekday')} – ${formatDate(i.endDate, 'weekday')} · All day`
                : `${formatDate(i.startDate, 'long')} · ${formatTime(i.start, tz)} – ${formatTime(i.end, tz)}`}
            </p>
            {e.rrule && (
              <p className="flex items-center gap-1.5 text-xs">
                <Repeat className="h-3.5 w-3.5" /> {describeRRule(e.rrule)}
              </p>
            )}
            {e.location && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {e.location}
              </p>
            )}
            {e.reminders.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs">
                <Bell className="h-3.5 w-3.5" /> {e.reminders.map((r) => REMINDER_CHOICES.find((c) => c.v === r)?.label ?? `${r} min`).join(', ')} before
              </p>
            )}
            {tracker && (
              <p className="flex items-center gap-1.5 text-xs">
                <Link2 className="h-3.5 w-3.5" /> Linked to <Link to={`/trackers/${tracker.id}${e.linkedRecordId ? `?record=${e.linkedRecordId}` : ''}`} className="text-accent hover:underline" onClick={onClose}>{tracker.name}</Link>
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge color={i.color}>{settings.eventCategories.find((c) => c.id === e.category)?.name ?? e.category}</Badge>
              {source && <Badge>{source.kind === 'subscription' ? `Subscribed: ${source.name}` : 'Imported from .ics'}</Badge>}
              {e.readOnly && (
                <Badge tone="warn">
                  <Lock className="h-3 w-3" /> Read-only
                </Badge>
              )}
              {e.demo && <Badge tone="warn">Demo</Badge>}
            </div>
          </div>
          {e.description && <p className="rounded-xl bg-surface-2 p-3 text-xs whitespace-pre-wrap text-fg-2">{e.description}</p>}
          {e.readOnly ? (
            <p className="text-xs text-muted">This event comes from a read-only calendar subscription. Change it in Apple Calendar; it updates here on the next refresh.</p>
          ) : (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              {i.recurring && (
                <Button size="sm" variant="ghost" className="text-bad-fg" onClick={() => remove('one')}>
                  Delete this one
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-bad-fg" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove('all')}>
                {i.recurring ? 'Delete series' : 'Delete'}
              </Button>
              <Button size="sm" variant="primary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(e)}>
                {i.recurring ? 'Edit series' : 'Edit'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
