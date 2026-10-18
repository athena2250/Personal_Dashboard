import { describe, expect, it } from 'vitest'
import { TABLES, fieldExpr, schemaDDL, slugify, toPg, trackerViewsSQL, upsertSQL } from './schema'

describe('slugify', () => {
  it('makes snake_case identifiers', () => {
    expect(slugify('GRE / TOEFL', 'x')).toBe('gre_toefl')
    expect(slugify('  Café Notes!! ', 'x')).toBe('cafe_notes')
  })
  it('falls back when empty and avoids a leading digit', () => {
    expect(slugify('🔥🔥', 'tracker_ab12')).toBe('tracker_ab12')
    expect(slugify('100 days of code', 'x')).toBe('t_100_days_of_code')
  })
})

describe('toPg', () => {
  it('drops values that do not fit the column type', () => {
    expect(toPg('', 'date')).toBeNull()
    expect(toPg('2026-10-18', 'date')).toBe('2026-10-18')
    expect(toPg(Number.NaN, 'numeric')).toBeNull()
    expect(toPg('yes', 'boolean')).toBeNull()
    expect(toPg(2.6, 'integer')).toBe(3)
    expect(toPg(['a'], 'jsonb')).toBe('["a"]')
    expect(toPg(undefined, 'text')).toBeNull()
  })
})

describe('upsertSQL', () => {
  it('maps fields to columns and keeps the raw row', () => {
    const row = { id: 't1', date: '2026-10-01', type: 'expense', amount: 12.5, tags: ['food'], extra: 1 }
    const { text, values } = upsertSQL('transactions', [row])
    expect(text).toContain('INSERT INTO "transactions"')
    expect(text).toContain('ON CONFLICT ("id") DO UPDATE')
    expect(values).toContain('2026-10-01')
    expect(values).toContain('["food"]')
    expect(values.at(-1)).toBe(JSON.stringify(row))
  })
  it('rejects unknown tables', () => {
    expect(() => upsertSQL('nope', [])).toThrow(/Unknown table/)
  })
})

describe('schemaDDL', () => {
  it('creates every table with a raw column', () => {
    const ddl = schemaDDL().join('\n')
    for (const spec of Object.values(TABLES)) expect(ddl).toContain(`CREATE TABLE IF NOT EXISTS "${spec.pg}"`)
    expect(ddl).toContain('"raw" jsonb NOT NULL')
  })
})

describe('trackerViewsSQL', () => {
  const tracker = {
    id: 'trk_1',
    name: 'Coding',
    fields: [
      { id: 'f1', name: 'Hours', type: 'number' },
      { id: 'f2', name: 'Title', type: 'text' }, // collides with a base column
      { id: 'f3', name: "Owner's pick", type: 'checkbox' },
    ],
    sessionFields: [{ id: 's1', name: 'Language', type: 'select' }],
  }

  it('creates a records view and a sessions view per tracker', () => {
    const views = trackerViewsSQL([tracker])
    expect(views.map((v) => v.name)).toEqual(['coding', 'coding_sessions'])
    expect(views[0].sql).toContain(`WHERE "tracker_id" = 'trk_1'`)
    expect(views[0].sql).toContain('AS "hours"')
    expect(views[0].sql).toContain('AS "title_2"')
    expect(views[1].sql).toContain('AS "language"')
  })

  it('de-duplicates trackers with the same name', () => {
    const views = trackerViewsSQL([tracker, { ...tracker, id: 'trk_2' }])
    expect(views.map((v) => v.name)).toEqual(['coding', 'coding_sessions', 'coding_2', 'coding_2_sessions'])
  })

  it('escapes quotes in field ids', () => {
    expect(fieldExpr('field_values', { id: "a'b", name: 'x', type: 'text' })).toContain("'a''b'")
  })
})
