import { db } from '../db'
import { DEFAULT_EVENT_CATEGORIES, DEFAULT_WIDGETS, defaultCategories, defaultSettings, defaultTrackers } from '../defaults'
import type { Settings } from '../models'
import { tracked } from '../saveStatus'
import { stamp } from './base'

let initPromise: Promise<void> | null = null

/** Creates default settings, Learning Hub trackers and categories on first launch (idempotent). */
export function ensureInitialized(): Promise<void> {
  initPromise ??= db.transaction('rw', [db.settings, db.trackers, db.categories], async () => {
    const existing = await db.settings.get('settings')
    if (!existing) {
      await db.settings.put(defaultSettings())
      const trackers = defaultTrackers()
      for (const t of trackers) if (!(await db.trackers.get(t.id))) await db.trackers.put(t)
      if ((await db.categories.count()) === 0) await db.categories.bulkPut(defaultCategories().map((c) => stamp(c)))
    } else {
      // Forward-compatible: add any widgets / event categories introduced by newer versions.
      const ids = new Set(existing.dashboardWidgets.map((w) => w.id))
      const missing = DEFAULT_WIDGETS.filter((w) => !ids.has(w.id))
      const patch: Partial<Settings> = {}
      if (missing.length) patch.dashboardWidgets = [...existing.dashboardWidgets, ...missing]
      if (!existing.eventCategories?.length) patch.eventCategories = DEFAULT_EVENT_CATEGORIES
      if (Object.keys(patch).length) await db.settings.update('settings', patch)
    }
  })
  return initPromise
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
