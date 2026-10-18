import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { HQDatabase } from './db'
import { startPgMirror } from './pgMirror'

type Op = { table: string; type: string; rows?: { id: string }[]; keys?: string[] }

const posted: Op[][] = []
const db = new HQDatabase('pg-mirror-test')

/** Waits for the debounced flush to post something new. */
async function nextBatch(): Promise<Op[]> {
  const before = posted.length
  await vi.waitFor(() => expect(posted.length).toBeGreaterThan(before), { timeout: 3000, interval: 50 })
  return posted.at(-1)!
}

beforeAll(async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    if (url === '/api/pg/status') return json({ ok: true, database: 'test', views: [] })
    posted.push((JSON.parse(String(init?.body)) as { ops: Op[] }).ops)
    return json({ ok: true })
  })
  await db.open()
  await db.tasks.put({ id: 'pre', title: 'Existing', done: false, priority: 'low', createdAt: '', updatedAt: '' })
  await startPgMirror(db)
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await db.delete()
})

describe('Postgres mirror', () => {
  it('backfills existing rows on start', async () => {
    const ops = posted.length ? posted[0] : await nextBatch()
    expect(ops).toContainEqual(expect.objectContaining({ table: 'tasks', type: 'upsert', rows: [expect.objectContaining({ id: 'pre' })] }))
  })

  it('sends the full row after a partial update', async () => {
    await db.tasks.update('pre', { done: true })
    const ops = await nextBatch()
    expect(ops).toEqual([{ table: 'tasks', type: 'upsert', rows: [expect.objectContaining({ id: 'pre', title: 'Existing', done: true })] }])
  })

  it('sends deletes, and a clear as clear + full table', async () => {
    await db.tasks.delete('pre')
    expect(await nextBatch()).toEqual([{ table: 'tasks', type: 'delete', keys: ['pre'] }])
    await db.tasks.put({ id: 'new', title: 'New', done: false, priority: 'low', createdAt: '', updatedAt: '' })
    await db.budgets.clear()
    const ops = await nextBatch()
    expect(ops).toContainEqual({ table: 'budgets', type: 'clear' })
    expect(ops).toContainEqual(expect.objectContaining({ table: 'tasks', type: 'upsert' }))
  })
})
