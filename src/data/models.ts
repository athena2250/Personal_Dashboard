/**
 * Typed data models. Every persisted row extends BaseRow.
 * `demo: true` marks opt-in demo rows so they can be removed in one action.
 */
import type { ISODate, MonthKey } from '@/lib/dates'

export interface BaseRow {
  id: string
  createdAt: string
  updatedAt: string
  demo?: boolean
}

/* ───────────────────────── Settings ───────────────────────── */

export type WidgetId =
  | 'quickActions'
  | 'today'
  | 'learning'
  | 'spending'
  | 'wealth'
  | 'events'
  | 'trackers'
  | 'heatmap'

export interface WidgetPref {
  id: WidgetId
  visible: boolean
}

export interface EventCategory {
  id: string
  name: string
  color: string
}

export interface Settings {
  id: 'settings'
  name: string
  theme: 'dark' | 'light' | 'system'
  baseCurrency: string
  timezone: string
  weekStartsOn: 0 | 1
  dashboardWidgets: WidgetPref[]
  eventCategories: EventCategory[]
  paymentMethods: string[]
  notificationsEnabled: boolean
  budgetWarnThreshold: number // 0..1, e.g. 0.8
  onboarded: boolean
  schemaVersion: number
}

/* ───────────────────────── Tasks ───────────────────────── */

export type Priority = 'low' | 'medium' | 'high'

export interface Task extends BaseRow {
  title: string
  notes?: string
  dueDate?: ISODate
  done: boolean
  doneAt?: string
  priority: Priority
  trackerId?: string
}

/* ───────────────────────── Trackers (reusable) ───────────────────────── */

export type FieldType = 'text' | 'longtext' | 'number' | 'date' | 'checkbox' | 'select' | 'url' | 'currency'

export interface FieldDef {
  id: string
  name: string
  type: FieldType
  options?: string[]
  required?: boolean
  showInTable?: boolean
}

export interface StatusDef {
  id: string
  name: string
  color: string
  done?: boolean
}

export type GoalMetric = 'minutes' | 'sessions' | 'count' | 'recordsDone'
export type GoalPeriod = 'day' | 'week' | 'month' | 'total'

export interface GoalDef {
  id: string
  title: string
  metric: GoalMetric
  period: GoalPeriod
  target: number
  deadline?: ISODate
}

export type TrackerTemplate = 'custom' | 'coding' | 'aiml' | 'apps' | 'testprep'
export type TrackerSection = 'learning' | 'personal'
export type TrackerView = 'table' | 'cards' | 'calendar'

export interface Tracker extends BaseRow {
  name: string
  description: string
  icon: string
  color: string
  section: TrackerSection
  template: TrackerTemplate
  /** Custom fields for this tracker's records. */
  fields: FieldDef[]
  /** Extra fields captured on each logged session (e.g. language, topic, difficulty). */
  sessionFields: FieldDef[]
  statuses: StatusDef[]
  categories: string[]
  view: TrackerView
  goals: GoalDef[]
  /** Label for the numeric "count" on sessions, e.g. "Problems solved". Empty = hidden. */
  countLabel: string
  recordLabel: string
  config: Record<string, unknown>
  archived: boolean
  order: number
}

export interface Milestone {
  id: string
  title: string
  done: boolean
  due?: ISODate
}

export interface TrackerRecord extends BaseRow {
  trackerId: string
  /** 'item' = the tracker's main records. Templates use extra kinds (e.g. 'mock', 'vocab'). */
  kind: string
  title: string
  status?: string
  category?: string
  progress?: number // 0..100
  deadline?: ISODate
  date?: ISODate
  notes?: string
  values: Record<string, unknown>
  milestones: Milestone[]
}

/** Unified learning/activity log. Every tracker logs sessions here. */
export interface LearningSession extends BaseRow {
  trackerId: string
  recordId?: string
  date: ISODate
  minutes: number
  title: string
  notes?: string
  count?: number
  attrs: Record<string, string | number | boolean>
}

/* ───────────────────────── Spending ───────────────────────── */

export type TxType = 'income' | 'expense'

export interface Transaction extends BaseRow {
  date: ISODate
  type: TxType
  amount: number
  currency: string
  /** Multiplier to base currency (1 when currency === base). */
  fxRate: number
  category: string
  subcategory?: string
  merchant: string
  paymentMethod?: string
  notes?: string
  tags: string[]
  recurringId?: string
  importBatch?: string
}

export interface Category extends BaseRow {
  name: string
  type: TxType
  color: string
  subcategories: string[]
  archived: boolean
}

export const TOTAL_BUDGET = '__total__'

export interface Budget extends BaseRow {
  category: string // category name or TOTAL_BUDGET
  month: MonthKey | '*' // '*' = default for every month
  amount: number
}

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringRule extends BaseRow {
  type: TxType
  amount: number
  currency: string
  fxRate: number
  category: string
  subcategory?: string
  merchant: string
  paymentMethod?: string
  notes?: string
  tags: string[]
  frequency: Frequency
  interval: number
  startDate: ISODate
  nextDate: ISODate
  endDate?: ISODate
  anchorDay?: number
  autoPost: boolean
  active: boolean
}

/* ───────────────────────── Wealth ───────────────────────── */

export type AssetType = 'sip' | 'mutual_fund' | 'fd' | 'stock' | 'etf' | 'cash' | 'other'
export type Compounding = 'monthly' | 'quarterly' | 'half-yearly' | 'yearly' | 'simple'

export interface SipPlan {
  amount: number
  frequency: 'monthly' | 'quarterly' | 'weekly'
  startDate: ISODate
  nextDate: ISODate
  dayOfMonth?: number
  active: boolean
}

export interface LinkRef {
  label: string
  url: string
}

export interface Investment extends BaseRow {
  name: string
  provider: string
  assetType: AssetType
  customType?: string
  currency: string
  startDate: ISODate
  interestRate?: number // annual %, FDs / savings
  expectedReturn?: number // annual %, informational only
  maturityDate?: ISODate
  maturityAmount?: number
  compounding?: Compounding
  sip?: SipPlan
  isLiability: boolean
  notes?: string
  links: LinkRef[]
  archived: boolean
}

export type InvTxnType = 'contribution' | 'withdrawal' | 'income' | 'fee'

export interface InvestmentTxn extends BaseRow {
  investmentId: string
  date: ISODate
  type: InvTxnType
  amount: number
  units?: number
  nav?: number
  notes?: string
  source: 'manual' | 'sip' | 'import'
}

export interface Valuation extends BaseRow {
  investmentId: string
  date: ISODate
  value: number
  /** actual = from a statement/app; estimate = your own guess. */
  source: 'actual' | 'estimate'
  notes?: string
}

/* ───────────────────────── Events ───────────────────────── */

export interface CalendarEvent extends BaseRow {
  title: string
  description?: string
  location?: string
  allDay: boolean
  /** allDay: YYYY-MM-DD. Timed: ISO UTC instant. */
  start: string
  /** allDay: inclusive YYYY-MM-DD. Timed: ISO UTC instant. */
  end: string
  /** IANA timezone the event was authored in (informational, for export). */
  timezone?: string
  category: string
  reminders: number[] // minutes before start
  rrule?: string
  exdates?: string[]
  linkedTrackerId?: string
  linkedRecordId?: string
  sourceId?: string // undefined = created in this app
  externalUid?: string
  externalRecurrenceId?: string
  externalLastModified?: string
  readOnly: boolean
}

export interface CalendarSource extends BaseRow {
  name: string
  kind: 'ics-file' | 'subscription'
  url?: string
  color: string
  direction: 'read-only'
  lastAttemptAt?: string
  lastSyncAt?: string
  lastError?: string
  lastResult?: { added: number; updated: number; removed: number; unchanged: number }
  autoRefreshMinutes: number // 0 = manual only
}

export interface KV {
  key: string
  value: unknown
}
