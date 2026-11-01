import { db } from '../db'
import { DEFAULT_EVENT_CATEGORIES, DEFAULT_WIDGETS, defaultCategories, defaultSettings, defaultTrackers } from '../defaults'
import type { FieldDef, Settings } from '../models'
import { tracked } from '../saveStatus'
import { stamp } from './base'

let initPromise: Promise<void> | null = null

/** Creates default settings, Learning Hub trackers and categories on first launch (idempotent). */
export function ensureInitialized(): Promise<void> {
  initPromise ??= db.transaction('rw', [db.settings, db.trackers, db.categories, db.kv], async () => {
    const existing = await db.settings.get('settings')
    if (!existing) {
      await db.settings.put(defaultSettings())
      const trackers = defaultTrackers()
      for (const t of trackers) if (!(await db.trackers.get(t.id))) await db.trackers.put(t)
      if ((await db.categories.count()) === 0) await db.categories.bulkPut(defaultCategories().map((c) => stamp(c)))
    } else {
      // Forward-compatible: add widgets / event categories introduced by newer versions and drop retired widgets.
      const known = new Set(DEFAULT_WIDGETS.map((w) => w.id))
      const kept = existing.dashboardWidgets.filter((w) => known.has(w.id))
      const ids = new Set(kept.map((w) => w.id))
      const missing = DEFAULT_WIDGETS.filter((w) => !ids.has(w.id))
      const patch: Partial<Settings> = {}
      if (missing.length || kept.length !== existing.dashboardWidgets.length) patch.dashboardWidgets = [...kept, ...missing]
      if (!existing.eventCategories?.length) patch.eventCategories = DEFAULT_EVENT_CATEGORIES
      if (Object.keys(patch).length) await db.settings.update('settings', patch)
      await addSqlCodingTopic()
    }
  })
  return initPromise
}

/** One-time: add the 'SQL' topic to an existing built-in Coding tracker (users can remove it afterwards). */
async function addSqlCodingTopic() {
  const flag = 'migration:codingSqlTopic'
  if (await db.kv.get(flag)) return
  const coding = await db.trackers.get('coding')
  if (coding) {
    const addSql = (fields: FieldDef[]) =>
      fields.map((f) => {
        if (f.id !== 'topic' || !f.options || f.options.includes('SQL')) return f
        const options = [...f.options]
        const other = options.indexOf('Other')
        options.splice(other === -1 ? options.length : other, 0, 'SQL')
        return { ...f, options }
      })
    await db.trackers.update('coding', { fields: addSql(coding.fields), sessionFields: addSql(coding.sessionFields) })
  }
  await db.kv.put({ key: flag, value: true })
}

export function resetInitCache() {
  initPromise = null
}

export function updateSettings(patch: Partial<Omit<Settings, 'id'>>) {
  return tracked(async () => {
    await db.settings.update('settings', patch)
  })
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined
}

export function setKV(key: string, value: unknown) {
  return db.kv.put({ key, value })
}
