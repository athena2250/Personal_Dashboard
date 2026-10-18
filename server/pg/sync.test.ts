/**
 * Integration test against a real local Postgres, using a throwaway `personal_hq_test` database.
 * Skipped automatically when Postgres is not reachable.
 */
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyOps, ensureDatabase, ensureSchema, refreshTrackerViews } from './sync'

const URL_ = process.env.PERSONAL_HQ_TEST_DATABASE_URL || 'postgres://localhost:5432/personal_hq_test'

async function reachable(): Promise<boolean> {
  try {
    await ensureDatabase(URL_)
    return true
  } catch {
    return false
  }
}

const available = await reachable()

describe.skipIf(!available)('applyOps (Postgres)', () => {
  let client: pg.Client

  beforeAll(async () => {
    client = new pg.Client({ connectionString: URL_ })
    await client.connect()
    await client.query('DROP SCHEMA IF EXISTS tracker_tables CASCADE')
    await client.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public`)
    await ensureSchema(client)
  })
  afterAll(async () => {
    await client?.end()
  })

  const views = async () =>
    (await client.query(`SELECT table_name FROM information_schema.views WHERE table_schema = 'tracker_tables' ORDER BY 1`)).rows.map(
      (r) => r.table_name as string,
    )

  const tracker = {
    id: 'trk_a',
    name: 'Rust',
    fields: [{ id: 'f1', name: 'Hours', type: 'number' }],
    sessionFields: [],
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
  }

  it('creates a view when a tracker is added, and types its fields', async () => {
    await applyOps(client, [
      { table: 'trackers', type: 'upsert', rows: [tracker] },
      {
        table: 'records',
        type: 'upsert',
        rows: [
          { id: 'r1', trackerId: 'trk_a', kind: 'item', title: 'Book', values: { f1: 3.5 }, milestones: [] },
          { id: 'r2', trackerId: 'trk_a', kind: 'item', title: 'Bad', values: { f1: 'n/a' }, milestones: [] },
        ],
      },
    ])
    expect(await views()).toEqual(['rust', 'rust_sessions'])
    const { rows } = await client.query('SELECT title, hours FROM tracker_tables.rust ORDER BY title')
    expect(rows).toEqual([
      { title: 'Bad', hours: null },
      { title: 'Book', hours: '3.5' },
    ])
  })

  it('renames the view when the tracker is renamed', async () => {
    await applyOps(client, [{ table: 'trackers', type: 'upsert', rows: [{ ...tracker, name: 'Rust Lang' }] }])
    expect(await views()).toEqual(['rust_lang', 'rust_lang_sessions'])
  })

  it('drops the view when the tracker is deleted', async () => {
    await applyOps(client, [{ table: 'trackers', type: 'delete', keys: ['trk_a'] }])
    expect(await views()).toEqual([])
  })

  it('upserts are idempotent and clear empties a table', async () => {
    const tx = { id: 'tx1', date: '2026-10-01', type: 'expense', amount: 10, tags: [] }
    await applyOps(client, [{ table: 'transactions', type: 'upsert', rows: [tx] }])
    await applyOps(client, [{ table: 'transactions', type: 'upsert', rows: [{ ...tx, amount: 12 }] }])
    const one = await client.query('SELECT amount FROM transactions')
    expect(one.rows).toEqual([{ amount: '12' }])
    await applyOps(client, [{ table: 'transactions', type: 'clear' }])
    expect((await client.query('SELECT count(*)::int AS n FROM transactions')).rows[0].n).toBe(0)
  })

  it('rolls back the whole batch on an unknown table', async () => {
    await expect(
      applyOps(client, [
        { table: 'transactions', type: 'upsert', rows: [{ id: 'tx2', amount: 1 }] },
        { table: 'nope', type: 'clear' },
      ]),
    ).rejects.toThrow(/Unknown table/)
    expect((await client.query('SELECT count(*)::int AS n FROM transactions')).rows[0].n).toBe(0)
    expect(await refreshTrackerViews(client)).toEqual([])
  })
})
