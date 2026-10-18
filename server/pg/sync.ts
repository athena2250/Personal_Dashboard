/**
 * Applies change batches from the browser to the local Postgres mirror.
 *
 * Connection: PERSONAL_HQ_DATABASE_URL, default postgres://localhost:5432/personal_hq
 * (local socket auth, no password stored anywhere in this repo).
 */
import pg from 'pg'
import { TABLES, TRACKER_SCHEMA, qi, schemaDDL, trackerViewsSQL, upsertSQL, type TrackerLike } from './schema'

export const DEFAULT_URL = 'postgres://localhost:5432/personal_hq'

export type SyncOp =
  | { table: string; type: 'upsert'; rows: Record<string, unknown>[] }
  | { table: string; type: 'delete'; keys: string[] }
  | { table: string; type: 'clear' }

export function databaseUrl(): string {
  return process.env.PERSONAL_HQ_DATABASE_URL || DEFAULT_URL
}

/** Creates the target database if it does not exist (connects to the `postgres` maintenance db). */
export async function ensureDatabase(url = databaseUrl()): Promise<void> {
  const target = new URL(url)
  const dbName = decodeURIComponent(target.pathname.slice(1))
  const admin = new URL(url)
  admin.pathname = '/postgres'
  const client = new pg.Client({ connectionString: admin.toString() })
  await client.connect()
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
    if (!rowCount) await client.query(`CREATE DATABASE ${qi(dbName)}`)
  } finally {
    await client.end()
  }
}

export async function ensureSchema(client: pg.ClientBase): Promise<void> {
  for (const stmt of schemaDDL()) await client.query(stmt)
}

/** Drops and recreates every per-tracker view from the current `trackers` table. */
export async function refreshTrackerViews(client: pg.ClientBase): Promise<string[]> {
  const existing = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.views WHERE table_schema = $1`,
    [TRACKER_SCHEMA],
  )
  for (const { table_name } of existing.rows) {
    await client.query(`DROP VIEW IF EXISTS ${qi(TRACKER_SCHEMA)}.${qi(table_name)}`)
  }
  const { rows } = await client.query<{ raw: TrackerLike }>(`SELECT raw FROM "trackers"`)
  const views = trackerViewsSQL(rows.map((r) => r.raw))
  for (const v of views) await client.query(v.sql)
  return views.map((v) => v.name)
}

const CHUNK = 200

export async function applyOps(client: pg.ClientBase, ops: SyncOp[]): Promise<{ applied: number }> {
  let applied = 0
  let trackersChanged = false
  await client.query('BEGIN')
  try {
    for (const op of ops) {
      const spec = TABLES[op.table]
      if (!spec) throw new Error(`Unknown table "${op.table}"`)
      if (op.table === 'trackers') trackersChanged = true
      if (op.type === 'upsert') {
        for (let i = 0; i < op.rows.length; i += CHUNK) {
          const { text, values } = upsertSQL(op.table, op.rows.slice(i, i + CHUNK))
          await client.query(text, values)
        }
        applied += op.rows.length
      } else if (op.type === 'delete') {
        const keyCol = spec.cols[spec.key][0]
        await client.query(`DELETE FROM ${qi(spec.pg)} WHERE ${qi(keyCol)} = ANY($1::text[])`, [op.keys])
        applied += op.keys.length
      } else {
        await client.query(`DELETE FROM ${qi(spec.pg)}`)
        applied++
      }
    }
    if (trackersChanged) await refreshTrackerViews(client)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
  return { applied }
}

let pool: pg.Pool | null = null
let ready: Promise<void> | null = null

/** Lazily connects, creating the database, tables and views on first use. */
export async function getPool(): Promise<pg.Pool> {
  if (!pool) pool = new pg.Pool({ connectionString: databaseUrl(), max: 4 })
  if (!ready) {
    const p = pool
    ready = (async () => {
      await ensureDatabase()
      const client = await p.connect()
      try {
        await ensureSchema(client)
        await refreshTrackerViews(client)
      } finally {
        client.release()
      }
    })().catch((err) => {
      ready = null // retry on the next request
      throw err
    })
  }
  await ready
  return pool
}
