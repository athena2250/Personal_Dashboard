/**
 * IndexedDB schema (Dexie). Only primary keys and queried fields are indexed;
 * booleans are not indexable in IndexedDB so they are filtered in memory.
 *
 * Bump the version and add an `.upgrade()` when changing indexes or migrating data.
 */
import Dexie, { type EntityTable } from 'dexie'
import type {
  Budget,
  CalendarEvent,
  CalendarSource,
  Category,
  Investment,
  InvestmentTxn,
  KV,
  LearningSession,
  RecurringRule,
  Settings,
  Task,
  Tracker,
  TrackerRecord,
  Transaction,
  Valuation,
} from './models'

export class HQDatabase extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  tasks!: EntityTable<Task, 'id'>
  trackers!: EntityTable<Tracker, 'id'>
  records!: EntityTable<TrackerRecord, 'id'>
  sessions!: EntityTable<LearningSession, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  recurring!: EntityTable<RecurringRule, 'id'>
  investments!: EntityTable<Investment, 'id'>
  invTxns!: EntityTable<InvestmentTxn, 'id'>
  valuations!: EntityTable<Valuation, 'id'>
  events!: EntityTable<CalendarEvent, 'id'>
  calendarSources!: EntityTable<CalendarSource, 'id'>
  kv!: EntityTable<KV, 'key'>

  constructor(name = 'personal-hq') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      tasks: 'id, dueDate, trackerId',
      trackers: 'id, section, order',
      records: 'id, trackerId, kind, deadline, [trackerId+kind]',
      sessions: 'id, trackerId, recordId, date',
      transactions: 'id, date, type, category, recurringId, importBatch',
      categories: 'id, name, type',
      budgets: 'id, category, month',
      recurring: 'id, nextDate',
      investments: 'id, assetType',
      invTxns: 'id, investmentId, date',
      valuations: 'id, investmentId, date',
      events: 'id, start, sourceId, externalUid',
      calendarSources: 'id',
      kv: 'key',
    })
  }
}

export const db = new HQDatabase()

/** Tables included in backups, in restore order. */
export const BACKUP_TABLES = [
  'settings',
  'tasks',
  'trackers',
  'records',
  'sessions',
  'categories',
  'transactions',
  'budgets',
  'recurring',
  'investments',
  'invTxns',
  'valuations',
  'calendarSources',
  'events',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

/** Tables that may contain `demo: true` rows. */
export const DEMO_TABLES = [
  'tasks',
  'records',
  'sessions',
  'transactions',
  'budgets',
  'recurring',
  'investments',
  'invTxns',
  'valuations',
  'events',
] as const
