/**
 * One-way mirror of IndexedDB into the local Postgres database (see server/pgSync.ts).
 *
 * IndexedDB stays the source of truth. A Dexie middleware records which keys every write touched;
 * shortly after, those rows are re-read and sent to /api/pg/sync — rows that still exist are
 * upserted, rows that are gone are deleted. Range deletes (table.clear(), restore "replace")
 * re-send the whole table. Pending keys survive reloads and Postgres downtime via localStorage.
 *
 * On startup every row is upserted (never deleted), so a fresh or empty browser can never wipe
 * the mirror. When the endpoint is absent (static hosting) the mirror stays off.
 */
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, Dexie, Middleware } from 'dexie'
import { useSyncExternalStore } from 'react'

export type MirrorState = 'off' | 'connecting' | 'synced' | 'syncing' | 'error'

export interface MirrorStatus {
  state: MirrorState
  database: string | null
  views: string[]
  pending: number
  lastSyncAt: number | null
  error: string | null
}

type SyncOp =
  | { table: string; type: 'upsert'; rows: unknown[] }
  | { table: string; type: 'delete'; keys: string[] }
  | { table: string; type: 'clear' }

const STORAGE_KEY = 'phq-pg-pending'
const DEBOUNCE_MS = 800
const MAX_ROWS_PER_BATCH = 2000
const MAX_BACKOFF_MS = 60_000

let status: MirrorStatus = { state: 'off', database: null, views: [], pending: 0, lastSyncAt: null, error: null }
const listeners = new Set<() => void>()
function setStatus(next: Partial<MirrorStatus>) {
  status = { ...status, ...next }
  listeners.forEach((l) => l())
}

/* ───────────── pending changes ───────────── */

/** table → key → generation of its latest write; a key is cleared only if unchanged since sent. */
const touched = new Map<string, Map<string, number>>()
const fullTables = new Map<string, number>()
let gen = 0
let started = false
let db: Dexie | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let backoff = 0

function countPending() {
  let n = fullTables.size
  touched.forEach((s) => (n += s.size))
  return n
}

function persist() {
  try {
    const data = { touched: Object.fromEntries([...touched].map(([t, m]) => [t, [...m.keys()]])), full: [...fullTables.keys()] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage unavailable: pending changes are kept in memory only
  }
}

function restorePending() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as { touched?: Record<string, string[]>; full?: string[] }
    for (const [t, keys] of Object.entries(data.touched ?? {})) keys.forEach((k) => touch(t, k))
    data.full?.forEach((t) => fullTables.set(t, ++gen))
  } catch {
    // ignore corrupt state; the startup backfill re-sends every row anyway
  }
}

function touch(table: string, key: unknown) {
  if (typeof key !== 'string' && typeof key !== 'number') return
  let keys = touched.get(table)
  if (!keys) touched.set(table, (keys = new Map()))
  keys.set(String(key), ++gen)
}

function schedule(delay = DEBOUNCE_MS) {
  if (!started) return
  setStatus({ pending: countPending() })
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), delay)
}

function record(table: string, req: DBCoreMutateRequest, res: DBCoreMutateResponse) {
  if (req.type === 'deleteRange') fullTables.set(table, ++gen)
  else if (req.type === 'delete') req.keys.forEach((k) => touch(table, k))
  else {
    req.keys?.forEach((k) => touch(table, k))
    res.results?.forEach((k) => touch(table, k))
    if (req.type === 'put') req.updates?.keys.forEach((k) => touch(table, k))
  }
  persist()
  schedule()
}

/** Registered on the Dexie instance; inert until startPgMirror() runs. */
export const mirrorMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'pgMirror',
  create(down) {
    return {
      ...down,
      table(name) {
        const table = down.table(name)
        return {
          ...table,
          mutate(req) {
            return table.mutate(req).then((res) => {
              if (started) record(name, req, res)
              return res
            })
          },
        }
      },
    }
  },
}

/* ───────────── network ───────────── */

async function post(ops: SyncOp[]) {
  const resp = await fetch('/api/pg/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops }),
  })
  const body = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!resp.ok || !body.ok) throw new Error(body.error ?? `Sync failed (HTTP ${resp.status}).`)
}

async function refreshStatus(): Promise<boolean> {
  const resp = await fetch('/api/pg/status').catch(() => null)
  const isJson = resp?.headers.get('content-type')?.includes('application/json')
  if (!resp || !isJson) return false // no endpoint here (e.g. static hosting)
  const body = (await resp.json()) as { ok: boolean; database?: string; views?: string[]; error?: string }
  if (!body.ok) throw new Error(body.error ?? 'Postgres is unavailable.')
  setStatus({ database: body.database ?? null, views: body.views ?? [] })
  return true
}

/** Builds ops from pending changes; they stay pending until the POST succeeds (`done`). */
async function buildOps(): Promise<{ ops: SyncOp[]; done: () => void }> {
  const ops: SyncOp[] = []
  const tableSnap = [...fullTables]
  const keySnap: [string, [string, number][]][] = []
  let budget = MAX_ROWS_PER_BATCH
  for (const [t] of tableSnap) {
    ops.push({ table: t, type: 'clear' })
    ops.push({ table: t, type: 'upsert', rows: await db!.table(t).toArray() })
  }
  for (const [t, keys] of touched) {
    if (fullTables.has(t) || !keys.size || budget <= 0) continue
    const entries = [...keys].slice(0, budget)
    budget -= entries.length
    keySnap.push([t, entries])
    const ids = entries.map(([k]) => k)
    const rows = await db!.table(t).bulkGet(ids)
    const present = rows.filter((r) => r != null)
    const missing = ids.filter((_, i) => rows[i] == null)
    if (present.length) ops.push({ table: t, type: 'upsert', rows: present })
    if (missing.length) ops.push({ table: t, type: 'delete', keys: missing })
  }
  const done = () => {
    for (const [t, g] of tableSnap) {
      if (fullTables.get(t) === g) fullTables.delete(t)
      // The whole table was re-sent; keep only keys written after that snapshot.
      touched.get(t)?.forEach((kg, k, keys) => kg <= g && keys.delete(k))
    }
    for (const [t, entries] of keySnap) {
      const keys = touched.get(t)
      for (const [k, g] of entries) if (keys?.get(k) === g) keys.delete(k)
    }
    persist()
  }
  return { ops, done }
}

async function flush() {
  timer = null
  if (flushing) return schedule()
  if (!countPending()) return setStatus({ pending: 0 })
  flushing = true
  setStatus({ state: 'syncing' })
  try {
    const { ops, done } = await buildOps()
    if (ops.length) await post(ops)
    done()
    backoff = 0
    const viewsChanged = ops.some((o) => o.table === 'trackers')
    if (viewsChanged) await refreshStatus().catch(() => undefined)
    setStatus({ state: 'synced', lastSyncAt: Date.now(), error: null, pending: countPending() })
  } catch (err) {
    backoff = Math.min(MAX_BACKOFF_MS, backoff ? backoff * 2 : 5_000)
    setStatus({ state: 'error', error: err instanceof Error ? err.message : String(err), pending: countPending() })
  } finally {
    flushing = false
    if (countPending()) schedule(status.state === 'error' ? backoff : DEBOUNCE_MS)
  }
}

/** Probes the local endpoint; if present, backfills every row and starts mirroring writes. */
export async function startPgMirror(database: Dexie): Promise<void> {
  if (started) return
  db = database
  setStatus({ state: 'connecting' })
  try {
    if (!(await refreshStatus())) return setStatus({ state: 'off' })
  } catch (err) {
    setStatus({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    // keep going: writes are queued and retried with backoff
  }
  started = true
  restorePending()
  for (const t of database.tables) for (const k of await t.toCollection().primaryKeys()) touch(t.name, k)
  schedule(0)
}

/** Retries immediately (e.g. after starting Postgres). */
export function retryPgMirror() {
  if (!db) return
  if (!started) return void startPgMirror(db)
  backoff = 0
  schedule(0)
}

export function usePgMirrorStatus(): MirrorStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
  )
}
