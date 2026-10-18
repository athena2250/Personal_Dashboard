import { db } from '../db'
import type { FieldDef, LearningSession, Milestone, Tracker, TrackerRecord } from '../models'
import { tracked } from '../saveStatus'
import { recordSchema, sessionSchema, trackerSchema, validate } from '../schemas'
import { slug, uid } from '@/lib/util'
import { compact, stamp, touch, type NewRow } from './base'

/* ───────────── Trackers ───────────── */

export type TrackerInput = Omit<NewRow<Tracker>, 'order' | 'archived'> & { order?: number; archived?: boolean }

function normalizeFields(fields: FieldDef[]): FieldDef[] {
  const seen = new Set<string>()
  return fields.map((f) => {
    let id = f.id || slug(f.name) || uid().slice(0, 8)
    while (seen.has(id)) id = `${id}-${uid().slice(0, 4)}`
    seen.add(id)
    return {
      ...f,
      id,
      name: f.name.trim(),
      options: f.type === 'select' ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    }
  })
}

export async function createTracker(input: TrackerInput) {
  validate(trackerSchema, input)
  return tracked(async () => {
    const order = input.order ?? (await db.trackers.count())
    const row = stamp<Tracker>({
      ...input,
      fields: normalizeFields(input.fields),
      sessionFields: normalizeFields(input.sessionFields),
      statuses: input.statuses.map((s) => ({ ...s, id: s.id || slug(s.name) || uid().slice(0, 6) })),
      order,
      archived: false,
    })
    await db.trackers.add(row)
    return row
  })
}

export async function updateTracker(id: string, patch: Partial<Omit<Tracker, 'id' | 'createdAt'>>) {
  if (patch.name !== undefined || patch.fields || patch.statuses) {
    validate(trackerSchema.partial(), patch)
  }
  return tracked(async () => {
    const p = { ...patch }
    if (p.fields) p.fields = normalizeFields(p.fields)
    if (p.sessionFields) p.sessionFields = normalizeFields(p.sessionFields)
    if (p.statuses) p.statuses = p.statuses.map((s) => ({ ...s, id: s.id || slug(s.name) || uid().slice(0, 6) }))
    await db.trackers.update(id, touch(p))
  })
}

export function setTrackerArchived(id: string, archived: boolean) {
  return tracked(() => db.trackers.update(id, touch({ archived })))
}

/** Permanently deletes a tracker and all of its records and sessions. */
export function deleteTracker(id: string) {
  return tracked(() =>
    db.transaction('rw', [db.trackers, db.records, db.sessions, db.tasks], async () => {
      await db.records.where('trackerId').equals(id).delete()
      await db.sessions.where('trackerId').equals(id).delete()
      await db.tasks.where('trackerId').equals(id).modify({ trackerId: undefined })
      await db.trackers.delete(id)
    }),
  )
}

export function reorderTrackers(ids: string[]) {
  return tracked(() =>
    db.transaction('rw', db.trackers, async () => {
      await Promise.all(ids.map((id, i) => db.trackers.update(id, { order: i })))
    }),
  )
}

/* ───────────── Records ───────────── */

export type RecordInput = Omit<NewRow<TrackerRecord>, 'milestones'> & { milestones?: Milestone[] }

export async function addRecord(input: RecordInput) {
  validate(recordSchema, input)
  return tracked(async () => {
    const row = stamp<TrackerRecord>(compact({ ...input, title: input.title.trim(), milestones: input.milestones ?? [], values: input.values ?? {} }))
    await db.records.add(row)
    return row
  })
}

export async function updateRecord(id: string, patch: Partial<Omit<TrackerRecord, 'id' | 'createdAt'>>) {
  if (patch.title !== undefined || patch.progress !== undefined) validate(recordSchema.partial(), patch)
  return tracked(() => db.records.update(id, touch(patch)))
}

export function deleteRecord(id: string) {
  return tracked(() =>
    db.transaction('rw', [db.records, db.sessions, db.events], async () => {
      await db.sessions.where('recordId').equals(id).modify({ recordId: undefined })
      await db.events.filter((e) => e.linkedRecordId === id).modify({ linkedRecordId: undefined })
      await db.records.delete(id)
    }),
  )
}

export function bulkAddRecords(rows: RecordInput[]) {
  return tracked(async () => {
    const stamped = rows.map((r) => stamp<TrackerRecord>(compact({ ...r, milestones: r.milestones ?? [], values: r.values ?? {} })))
    await db.records.bulkAdd(stamped)
    return stamped.length
  })
}

/* ───────────── Sessions (unified learning log) ───────────── */

export type SessionInput = NewRow<LearningSession>

export async function addSession(input: SessionInput) {
  validate(sessionSchema, input)
  return tracked(async () => {
    const row = stamp<LearningSession>(compact({ ...input, title: input.title.trim(), attrs: input.attrs ?? {} }))
    await db.sessions.add(row)
    return row
  })
}

export async function updateSession(id: string, patch: Partial<Omit<LearningSession, 'id' | 'createdAt'>>) {
  validate(sessionSchema.partial(), patch)
  return tracked(() => db.sessions.update(id, touch(patch)))
}

export function deleteSession(id: string) {
  return tracked(() => db.sessions.delete(id))
}

export function bulkAddSessions(rows: SessionInput[]) {
  return tracked(async () => {
    const stamped = rows.map((r) => stamp<LearningSession>(compact({ ...r, attrs: r.attrs ?? {} })))
    await db.sessions.bulkAdd(stamped)
    return stamped.length
  })
}
