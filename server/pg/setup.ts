/**
 * `npm run db:setup` — creates the Personal HQ database, tables and per-tracker views.
 * Safe to re-run: every statement is idempotent and no rows are touched.
 */
import { DEFAULT_URL, databaseUrl, getPool } from './sync'
import { TABLES, TRACKER_SCHEMA } from './schema'

const url = new URL(databaseUrl())
console.log(`Setting up ${url.hostname}:${url.port || 5432}${url.pathname}${databaseUrl() === DEFAULT_URL ? ' (default)' : ''}`)

try {
  const pool = await getPool()
  const { rows } = await pool.query<{ table_name: string; n: string }>(
    `SELECT c.relname AS table_name, c.reltuples::bigint AS n
       FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`,
  )
  const views = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY 1`,
    [TRACKER_SCHEMA],
  )
  const ours = new Set(Object.values(TABLES).map((t) => t.pg))
  console.log(`\nTables (${ours.size}):`)
  for (const r of rows) if (ours.has(r.table_name)) console.log(`  public.${r.table_name}`)
  console.log(`\nTracker views (${views.rowCount}):`)
  for (const v of views.rows) console.log(`  ${TRACKER_SCHEMA}.${v.table_name}`)
  if (!views.rowCount) console.log('  (none yet — created automatically as the app syncs your trackers)')
  await pool.end()
} catch (err) {
  console.error('\nSetup failed:', (err as Error).message)
  process.exitCode = 1
}
