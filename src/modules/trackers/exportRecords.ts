import type { LearningSession, Tracker, TrackerRecord } from '@/data/models'
import { toCsv } from '@/domain/csv'
import { downloadFile, slug } from '@/lib/util'

export function exportSessionsCsv(sessions: LearningSession[], trackers: Tracker[], filename = 'learning-log') {
  const byId = new Map(trackers.map((t) => [t.id, t]))
  const attrKeys = [...new Set(sessions.flatMap((s) => Object.keys(s.attrs ?? {})))]
  const rows = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => ({
      date: s.date,
      tracker: byId.get(s.trackerId)?.name ?? s.trackerId,
      title: s.title,
      minutes: s.minutes,
      count: s.count ?? '',
      ...Object.fromEntries(attrKeys.map((k) => [k, s.attrs?.[k] ?? ''])),
      notes: s.notes ?? '',
      demo: s.demo ? 'yes' : '',
    }))
  downloadFile(`${slug(filename)}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv')
}

export function exportRecordsCsv(records: TrackerRecord[], tracker: Tracker) {
  const statusName = new Map(tracker.statuses.map((s) => [s.id, s.name]))
  const rows = records.map((r) => ({
    title: r.title,
    kind: r.kind,
    status: statusName.get(r.status ?? '') ?? r.status ?? '',
    category: r.category ?? '',
    progress: r.progress ?? '',
    deadline: r.deadline ?? '',
    date: r.date ?? '',
    ...Object.fromEntries(tracker.fields.map((f) => [f.name, r.values?.[f.id] ?? ''])),
    ...(r.kind !== 'item' ? Object.fromEntries(Object.entries(r.values ?? {}).filter(([k]) => !tracker.fields.some((f) => f.id === k))) : {}),
    milestones: r.milestones.map((m) => `${m.done ? '[x]' : '[ ]'} ${m.title}${m.due ? ` (${m.due})` : ''}`).join('; '),
    notes: r.notes ?? '',
  }))
  downloadFile(`${slug(tracker.name)}-records-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv')
}
