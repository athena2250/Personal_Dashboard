/**
 * Full backup / restore of every table as a versioned JSON document.
 */
import { z } from 'zod'
import { BACKUP_TABLES, db, DEMO_TABLES, type BackupTable } from './db'
import { tracked } from './saveStatus'
import { SCHEMA_VERSION } from './defaults'
import { resetInitCache } from './repos/settings'

export interface BackupFile {
  app: 'personal-hq'
  version: number
  exportedAt: string
  tables: Partial<Record<BackupTable, unknown[]>>
}

const rowSchema = z.object({ id: z.string().min(1) }).passthrough()
const backupSchema = z.object({
  app: z.literal('personal-hq'),
  version: z.number().int().min(1),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(rowSchema)),
})

export async function createBackup(): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {}
  for (const t of BACKUP_TABLES) tables[t] = await db.table(t).toArray()
  return { app: 'personal-hq', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables }
}

export interface BackupPreview {
  exportedAt: string
  version: number
  counts: Record<string, number>
}

export function parseBackup(text: string): { backup: BackupFile; preview: BackupPreview } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  const res = backupSchema.safeParse(json)
  if (!res.success) throw new Error('This is not a Personal HQ backup file (unexpected structure).')
  if (res.data.version > SCHEMA_VERSION) throw new Error(`This backup was made by a newer version (v${res.data.version}). Update the app first.`)
  const unknown = Object.keys(res.data.tables).filter((k) => !(BACKUP_TABLES as readonly string[]).includes(k))
  if (unknown.length) throw new Error(`Backup contains unknown tables: ${unknown.join(', ')}`)
  const counts: Record<string, number> = {}
  for (const [k, v] of Object.entries(res.data.tables)) counts[k] = v.length
  return { backup: res.data as BackupFile, preview: { exportedAt: res.data.exportedAt, version: res.data.version, counts } }
}

/**
 * Restores a backup.
 * - replace: clears every table first (exact copy of the backup).
 * - merge: upserts rows by id; existing rows not in the backup are kept.
 */
export function restoreBackup(backup: BackupFile, mode: 'replace' | 'merge') {
  return tracked(async () => {
    const tables = BACKUP_TABLES.map((t) => db.table(t))
    await db.transaction('rw', tables, async () => {
      for (const t of BACKUP_TABLES) {
        const rows = backup.tables[t]
        if (mode === 'replace') await db.table(t).clear()
        if (rows?.length) await db.table(t).bulkPut(rows)
      }
    })
    resetInitCache()
  })
}

export function eraseAllData() {
  return tracked(async () => {
    await db.transaction('rw', [...BACKUP_TABLES.map((t) => db.table(t)), db.kv], async () => {
      for (const t of BACKUP_TABLES) await db.table(t).clear()
      await db.kv.clear()
    })
    resetInitCache()
  })
}

export async function countDemoRows(): Promise<number> {
  let n = 0
  for (const t of DEMO_TABLES) n += await db.table(t).filter((r: { demo?: boolean }) => r.demo === true).count()
  return n
}
