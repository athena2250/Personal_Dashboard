import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ensureInitialized, resetInitCache } from './repos/settings'
import { addSession, addRecord, createTracker, deleteTracker } from './repos/trackers'
import { addTransaction, importTransactions, postRecurring, addRecurring, processAutoPost, updateCategory, deleteCategory, setBudget } from './repos/spending'
import { addInvestment, recordSipInstallment } from './repos/wealth'
import { addSource, importParsedEvents } from './repos/events'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { loadDemoData, removeDemoData } from './demo'
import { parseICS } from '@/domain/ics'
import { ValidationError } from './saveStatus'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetInitCache()
  await ensureInitialized()
})

describe('initialisation', () => {
  it('seeds settings, 4 learning trackers and categories without records', async () => {
    expect(await db.settings.get('settings')).toBeTruthy()
    const trackers = await db.trackers.toArray()
    expect(trackers.map((t) => t.id).sort()).toEqual(['aiml', 'apps', 'coding', 'testprep'])
    expect(await db.categories.count()).toBeGreaterThan(10)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('trackers', () => {
  it('creates a custom tracker with normalised field ids and cascades delete', async () => {
    const t = await createTracker({
      name: 'Books',
      description: '',
      icon: 'BookOpen',
      color: '#8b5cf6',
      section: 'learning',
      template: 'custom',
      fields: [
        { id: '', name: 'Author', type: 'text' },
        { id: '', name: 'Author', type: 'text' },
        { id: '', name: 'Genre', type: 'select', options: [' Fiction ', '', 'Non-fiction'] },
      ],
      sessionFields: [],
      statuses: [{ id: '', name: 'Reading', color: '#000' }],
      categories: [],
      view: 'cards',
      goals: [],
      countLabel: 'Pages',
      recordLabel: 'Book',
      config: {},
    })
    expect(t.fields[0].id).toBe('author')
    expect(t.fields[1].id).not.toBe('author')
    expect(t.fields[2].options).toEqual(['Fiction', 'Non-fiction'])
    await addRecord({ trackerId: t.id, kind: 'item', title: 'Dune', values: { author: 'Herbert' } })
    await addSession({ trackerId: t.id, date: '2026-10-18', minutes: 30, title: 'Read', attrs: {} })
    await deleteTracker(t.id)
    expect(await db.records.where('trackerId').equals(t.id).count()).toBe(0)
    expect(await db.sessions.where('trackerId').equals(t.id).count()).toBe(0)
  })

  it('validates sessions', async () => {
    await expect(addSession({ trackerId: 'coding', date: 'bad', minutes: 10, title: 'x', attrs: {} })).rejects.toBeInstanceOf(ValidationError)
    await expect(addSession({ trackerId: 'coding', date: '2026-10-18', minutes: -1, title: 'x', attrs: {} })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('spending', () => {
  const t = { date: '2026-10-10', type: 'expense' as const, amount: 100, currency: 'INR', fxRate: 1, category: 'Food & Dining', merchant: 'Cafe', tags: [] }

  it('rejects invalid transactions', async () => {
    await expect(addTransaction({ ...t, amount: 0 })).rejects.toBeInstanceOf(ValidationError)
    await expect(addTransaction({ ...t, merchant: ' ' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('imports without duplicates and creates missing categories', async () => {
    await addTransaction(t)
    const res = await importTransactions([t, { ...t, merchant: 'cafe ' }, { ...t, amount: 50, category: 'Pets' }])
    expect(res.added).toBe(1)
    expect(res.skipped).toBe(2)
    expect(res.newCategories).toEqual(['Pets'])
  })

  it('renaming a category cascades; deleting a used category is blocked', async () => {
    await addTransaction(t)
    await setBudget('Food & Dining', '*', 5000)
    const cat = (await db.categories.where('name').equals('Food & Dining').first())!
    await updateCategory(cat.id, { name: 'Food' })
    expect((await db.transactions.toArray())[0].category).toBe('Food')
    expect((await db.budgets.toArray())[0].category).toBe('Food')
    await expect(deleteCategory(cat.id)).rejects.toThrow(/used by 1/)
  })

  it('posts recurring and auto-posts due occurrences once', async () => {
    const rule = await addRecurring({ ...t, merchant: 'Netflix', frequency: 'monthly', interval: 1, startDate: '2026-08-31', autoPost: true, active: true })
    await postRecurring(rule)
    expect((await db.recurring.get(rule.id))!.nextDate).toBe('2026-09-30')
    expect(await processAutoPost('2026-10-31')).toBe(2)
    expect(await processAutoPost('2026-10-31')).toBe(0)
    const dates = (await db.transactions.toArray()).map((x) => x.date).sort()
    expect(dates).toEqual(['2026-08-31', '2026-09-30', '2026-10-31'])
  })
})

describe('wealth', () => {
  it('records FD principal as contribution and SIP installments advance', async () => {
    const fd = await addInvestment({ name: 'HDFC FD', provider: 'HDFC', assetType: 'fd', currency: 'INR', startDate: '2026-01-01', interestRate: 7, isLiability: false, links: [], archived: false }, 100000)
    const txns = await db.invTxns.where('investmentId').equals(fd.id).toArray()
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({ type: 'contribution', amount: 100000 })

    const sip = await addInvestment({
      name: 'Groww SIP',
      provider: 'Groww',
      assetType: 'sip',
      currency: 'INR',
      startDate: '2026-01-05',
      isLiability: false,
      links: [],
      archived: false,
      sip: { amount: 5000, frequency: 'monthly', startDate: '2026-01-05', nextDate: '2026-01-31', dayOfMonth: 31, active: true },
    })
    await recordSipInstallment(sip)
    const after = (await db.investments.get(sip.id))!
    expect(after.sip!.nextDate).toBe('2026-02-28')
    expect(await db.invTxns.where('investmentId').equals(sip.id).count()).toBe(1)
  })
})

describe('events import', () => {
  const ics = (summary: string) =>
    ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:u1', 'DTSTART:20261101T100000Z', 'DTEND:20261101T110000Z', `SUMMARY:${summary}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')

  it('upserts by UID and mirrors subscriptions', async () => {
    const src = await addSource({ name: 'iCloud', kind: 'subscription', url: 'webcal://p01-caldav.icloud.com/x', color: '#000', autoRefreshMinutes: 0 })
    let r = await importParsedEvents(src, parseICS(ics('A'), 'UTC').events, { category: 'imported', mirror: true, readOnly: true })
    expect(r.added).toBe(1)
    r = await importParsedEvents(src, parseICS(ics('A'), 'UTC').events, { category: 'imported', mirror: true, readOnly: true })
    expect(r.unchanged).toBe(1)
    r = await importParsedEvents(src, parseICS(ics('B'), 'UTC').events, { category: 'imported', mirror: true, readOnly: true })
    expect(r.updated).toBe(1)
    expect(await db.events.count()).toBe(1)
    r = await importParsedEvents(src, [], { category: 'imported', mirror: true, readOnly: true })
    expect(r.removed).toBe(1)
    const s = (await db.calendarSources.get(src.id))!
    expect(s.lastSyncAt).toBeTruthy()
    expect(s.lastResult).toEqual({ added: 0, updated: 0, removed: 1, unchanged: 0 })
  })

  it('skips re-imported events that were exported from this app', async () => {
    const src = await addSource({ name: 'Files', kind: 'ics-file', color: '#000', autoRefreshMinutes: 0 })
    await db.events.add({ id: 'local1', createdAt: '', updatedAt: '', title: 'Mine', allDay: true, start: '2026-11-01', end: '2026-11-01', category: 'work', reminders: [], readOnly: false })
    const text = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:local1@personal-hq', 'DTSTART;VALUE=DATE:20261101', 'SUMMARY:Mine', 'END:VEVENT', 'END:VCALENDAR'].join('\n')
    const r = await importParsedEvents(src, parseICS(text, 'UTC').events, { category: 'imported', mirror: false, readOnly: false })
    expect(r.skippedLocal).toBe(1)
    expect(await db.events.count()).toBe(1)
  })
})

describe('backup & demo', () => {
  it('round-trips a backup in replace mode', async () => {
    await addTransaction({ date: '2026-10-10', type: 'expense', amount: 5, currency: 'INR', fxRate: 1, category: 'Other', merchant: 'x', tags: [] })
    const backup = await createBackup()
    const text = JSON.stringify(backup)
    await db.transactions.clear()
    const { backup: parsed, preview } = parseBackup(text)
    expect(preview.counts.transactions).toBe(1)
    await restoreBackup(parsed, 'replace')
    expect(await db.transactions.count()).toBe(1)
    expect(() => parseBackup('{"foo":1}')).toThrow(/not a Personal HQ backup/)
  })

  it('demo data is flagged and fully removable without touching real data', async () => {
    await addTransaction({ date: '2026-10-10', type: 'expense', amount: 5, currency: 'INR', fxRate: 1, category: 'Other', merchant: 'real', tags: [] })
    await loadDemoData('2026-10-18', 'INR')
    expect(await db.transactions.count()).toBeGreaterThan(10)
    const removed = await removeDemoData()
    expect(removed).toBeGreaterThan(10)
    const left = await db.transactions.toArray()
    expect(left.map((x) => x.merchant)).toEqual(['real'])
    expect(await db.sessions.count()).toBe(0)
    expect(await db.trackers.count()).toBe(4)
  })
})
