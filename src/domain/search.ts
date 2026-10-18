/**
 * Global search across all modules. Pure: callers pass the collections in.
 */
import type { CalendarEvent, Investment, LearningSession, Task, Tracker, TrackerRecord, Transaction } from '@/data/models'

export type SearchKind = 'task' | 'session' | 'record' | 'transaction' | 'investment' | 'event' | 'tracker'

export interface SearchResult {
  kind: SearchKind
  id: string
  title: string
  subtitle: string
  date?: string
  href: string
  score: number
}

export interface SearchCorpus {
  tasks: Task[]
  sessions: LearningSession[]
  records: TrackerRecord[]
  trackers: Tracker[]
  transactions: Transaction[]
  investments: Investment[]
  events: CalendarEvent[]
}

function score(query: string[], fields: (string | undefined)[]): number {
  const hay = fields.filter(Boolean).join(' \u0000 ').toLowerCase()
  if (!hay) return 0
  let s = 0
  for (const q of query) {
    const idx = hay.indexOf(q)
    if (idx < 0) return 0
    s += idx === 0 ? 3 : /\W/.test(hay[idx - 1] ?? ' ') ? 2 : 1
  }
  const title = (fields[0] ?? '').toLowerCase()
  if (title === query.join(' ')) s += 5
  else if (title.startsWith(query.join(' '))) s += 2
  return s
}

export function globalSearch(corpus: SearchCorpus, raw: string, limit = 40): SearchResult[] {
  const q = raw.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!q.length) return []
  const trackerName = new Map(corpus.trackers.map((t) => [t.id, t.name]))
  const out: SearchResult[] = []
  const push = (r: Omit<SearchResult, 'score'>, fields: (string | undefined)[]) => {
    const s = score(q, fields)
    if (s > 0) out.push({ ...r, score: s })
  }

  for (const t of corpus.trackers) {
    push({ kind: 'tracker', id: t.id, title: t.name, subtitle: t.description || 'Tracker', href: `/trackers/${t.id}` }, [t.name, t.description])
  }
  for (const t of corpus.tasks) {
    push({ kind: 'task', id: t.id, title: t.title, subtitle: t.done ? 'Completed task' : 'Task', date: t.dueDate, href: '/?task=' + t.id }, [t.title, t.notes])
  }
  for (const s of corpus.sessions) {
    const attrs = Object.values(s.attrs ?? {}).map(String)
    push(
      { kind: 'session', id: s.id, title: s.title, subtitle: `${trackerName.get(s.trackerId) ?? 'Tracker'} session · ${s.minutes} min`, date: s.date, href: `/trackers/${s.trackerId}?tab=log&highlight=${s.id}` },
      [s.title, s.notes, ...attrs],
    )
  }
  for (const r of corpus.records) {
    const vals = Object.values(r.values ?? {}).filter((v) => typeof v === 'string') as string[]
    push(
      { kind: 'record', id: r.id, title: r.title, subtitle: `${trackerName.get(r.trackerId) ?? 'Tracker'}${r.kind !== 'item' ? ` · ${r.kind}` : ''}`, date: r.deadline ?? r.date, href: `/trackers/${r.trackerId}?record=${r.id}` },
      [r.title, r.notes, r.category, ...vals],
    )
  }
  for (const t of corpus.transactions) {
    push(
      { kind: 'transaction', id: t.id, title: t.merchant, subtitle: `${t.type === 'income' ? 'Income' : 'Expense'} · ${t.category} · ${t.amount} ${t.currency}`, date: t.date, href: `/spending/transactions?q=${encodeURIComponent(t.merchant)}` },
      [t.merchant, t.category, t.subcategory, t.notes, t.paymentMethod, ...(t.tags ?? [])],
    )
  }
  for (const i of corpus.investments) {
    push({ kind: 'investment', id: i.id, title: i.name, subtitle: `${i.provider || 'Investment'} · ${i.assetType.toUpperCase()}`, href: `/wealth/holdings/${i.id}` }, [i.name, i.provider, i.notes, i.customType])
  }
  for (const e of corpus.events) {
    push({ kind: 'event', id: e.id, title: e.title, subtitle: e.location || 'Event', date: e.start.slice(0, 10), href: `/events?event=${e.id}` }, [e.title, e.description, e.location])
  }
  return out.sort((a, b) => b.score - a.score || (b.date ?? '').localeCompare(a.date ?? '')).slice(0, limit)
}
