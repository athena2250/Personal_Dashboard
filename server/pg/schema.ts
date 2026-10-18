/**
 * Postgres mirror schema for Personal HQ.
 *
 * Every Dexie table maps to one Postgres table with typed columns (camelCase field → snake_case
 * column) plus a `raw` jsonb copy of the full row, so fields added to the app later are never
 * lost. IndexedDB stays the app's source of truth; Postgres is a mirror kept current by
 * `server/pg/sync.ts`.
 *
 * Each tracker additionally gets two views in the `tracker_tables` schema, regenerated whenever
 * trackers change: `<slug>` (its records, custom fields as real columns) and `<slug>_sessions`.
 *
 * Pure module: no I/O, unit-tested in server/pg/schema.test.ts.
 */

export type PgType = 'text' | 'boolean' | 'integer' | 'numeric' | 'date' | 'timestamptz' | 'jsonb'

export interface TableSpec {
  /** Postgres table name. */
  pg: string
  /** JS primary-key field. */
  key: string
  /** JS field → [pg column, pg type]. Column names avoid SQL keywords (order, values, interval…). */
  cols: Record<string, [string, PgType]>
  /** Extra indexes (pg column names). */
  indexes?: string[]
}

const base: TableSpec['cols'] = {
  id: ['id', 'text'],
  createdAt: ['created_at', 'timestamptz'],
  updatedAt: ['updated_at', 'timestamptz'],
  demo: ['demo', 'boolean'],
}

/** Keyed by Dexie table name. */
export const TABLES: Record<string, TableSpec> = {
  settings: {
    pg: 'settings',
    key: 'id',
    cols: {
      id: ['id', 'text'],
      name: ['name', 'text'],
      theme: ['theme', 'text'],
      baseCurrency: ['base_currency', 'text'],
      timezone: ['timezone', 'text'],
      weekStartsOn: ['week_starts_on', 'integer'],
      dashboardWidgets: ['dashboard_widgets', 'jsonb'],
      eventCategories: ['event_categories', 'jsonb'],
      paymentMethods: ['payment_methods', 'jsonb'],
      notificationsEnabled: ['notifications_enabled', 'boolean'],
      budgetWarnThreshold: ['budget_warn_threshold', 'numeric'],
      onboarded: ['onboarded', 'boolean'],
      schemaVersion: ['schema_version', 'integer'],
    },
  },
  tasks: {
    pg: 'tasks',
    key: 'id',
    cols: {
      ...base,
      title: ['title', 'text'],
      notes: ['notes', 'text'],
      dueDate: ['due_date', 'date'],
      done: ['done', 'boolean'],
      doneAt: ['done_at', 'timestamptz'],
      priority: ['priority', 'text'],
      trackerId: ['tracker_id', 'text'],
    },
    indexes: ['due_date', 'tracker_id'],
  },
  trackers: {
    pg: 'trackers',
    key: 'id',
    cols: {
      ...base,
      name: ['name', 'text'],
      description: ['description', 'text'],
      icon: ['icon', 'text'],
      color: ['color', 'text'],
      section: ['section', 'text'],
      template: ['template', 'text'],
      fields: ['fields', 'jsonb'],
      sessionFields: ['session_fields', 'jsonb'],
      statuses: ['statuses', 'jsonb'],
      categories: ['categories', 'jsonb'],
      view: ['view_mode', 'text'],
      goals: ['goals', 'jsonb'],
      countLabel: ['count_label', 'text'],
      recordLabel: ['record_label', 'text'],
      config: ['config', 'jsonb'],
      archived: ['archived', 'boolean'],
      order: ['sort_order', 'integer'],
    },
  },
  records: {
    pg: 'tracker_records',
    key: 'id',
    cols: {
      ...base,
      trackerId: ['tracker_id', 'text'],
      kind: ['kind', 'text'],
      title: ['title', 'text'],
      status: ['status', 'text'],
      category: ['category', 'text'],
      progress: ['progress', 'numeric'],
      deadline: ['deadline', 'date'],
      date: ['record_date', 'date'],
      notes: ['notes', 'text'],
      values: ['field_values', 'jsonb'],
      milestones: ['milestones', 'jsonb'],
    },
    indexes: ['tracker_id', 'kind'],
  },
  sessions: {
    pg: 'learning_sessions',
    key: 'id',
    cols: {
      ...base,
      trackerId: ['tracker_id', 'text'],
      recordId: ['record_id', 'text'],
      date: ['session_date', 'date'],
      minutes: ['minutes', 'numeric'],
      title: ['title', 'text'],
      notes: ['notes', 'text'],
      count: ['count', 'numeric'],
      attrs: ['attrs', 'jsonb'],
    },
    indexes: ['tracker_id', 'session_date'],
  },
  transactions: {
    pg: 'transactions',
    key: 'id',
    cols: {
      ...base,
      date: ['txn_date', 'date'],
      type: ['type', 'text'],
      amount: ['amount', 'numeric'],
      currency: ['currency', 'text'],
      fxRate: ['fx_rate', 'numeric'],
      category: ['category', 'text'],
      subcategory: ['subcategory', 'text'],
      merchant: ['merchant', 'text'],
      paymentMethod: ['payment_method', 'text'],
      notes: ['notes', 'text'],
      tags: ['tags', 'jsonb'],
      recurringId: ['recurring_id', 'text'],
      importBatch: ['import_batch', 'text'],
    },
    indexes: ['txn_date', 'category'],
  },
  categories: {
    pg: 'spending_categories',
    key: 'id',
    cols: {
      ...base,
      name: ['name', 'text'],
      type: ['type', 'text'],
      color: ['color', 'text'],
      subcategories: ['subcategories', 'jsonb'],
      archived: ['archived', 'boolean'],
    },
  },
  budgets: {
    pg: 'budgets',
    key: 'id',
    cols: {
      ...base,
      category: ['category', 'text'],
      month: ['month', 'text'],
      amount: ['amount', 'numeric'],
    },
  },
  recurring: {
    pg: 'recurring_rules',
    key: 'id',
    cols: {
      ...base,
      type: ['type', 'text'],
      amount: ['amount', 'numeric'],
      currency: ['currency', 'text'],
      fxRate: ['fx_rate', 'numeric'],
      category: ['category', 'text'],
      subcategory: ['subcategory', 'text'],
      merchant: ['merchant', 'text'],
      paymentMethod: ['payment_method', 'text'],
      notes: ['notes', 'text'],
      tags: ['tags', 'jsonb'],
      frequency: ['frequency', 'text'],
      interval: ['repeat_interval', 'integer'],
      startDate: ['start_date', 'date'],
      nextDate: ['next_date', 'date'],
      endDate: ['end_date', 'date'],
      anchorDay: ['anchor_day', 'integer'],
      autoPost: ['auto_post', 'boolean'],
      active: ['active', 'boolean'],
    },
  },
  investments: {
    pg: 'investments',
    key: 'id',
    cols: {
      ...base,
      name: ['name', 'text'],
      provider: ['provider', 'text'],
      assetType: ['asset_type', 'text'],
      customType: ['custom_type', 'text'],
      currency: ['currency', 'text'],
      startDate: ['start_date', 'date'],
      interestRate: ['interest_rate', 'numeric'],
      expectedReturn: ['expected_return', 'numeric'],
      maturityDate: ['maturity_date', 'date'],
      maturityAmount: ['maturity_amount', 'numeric'],
      compounding: ['compounding', 'text'],
      sip: ['sip', 'jsonb'],
      isLiability: ['is_liability', 'boolean'],
      notes: ['notes', 'text'],
      links: ['links', 'jsonb'],
      archived: ['archived', 'boolean'],
    },
  },
  invTxns: {
    pg: 'investment_txns',
    key: 'id',
    cols: {
      ...base,
      investmentId: ['investment_id', 'text'],
      date: ['txn_date', 'date'],
      type: ['type', 'text'],
      amount: ['amount', 'numeric'],
      units: ['units', 'numeric'],
      nav: ['nav', 'numeric'],
      notes: ['notes', 'text'],
      source: ['source', 'text'],
    },
    indexes: ['investment_id', 'txn_date'],
  },
  valuations: {
    pg: 'valuations',
    key: 'id',
    cols: {
      ...base,
      investmentId: ['investment_id', 'text'],
      date: ['valuation_date', 'date'],
      value: ['value', 'numeric'],
      source: ['source', 'text'],
      notes: ['notes', 'text'],
    },
    indexes: ['investment_id', 'valuation_date'],
  },
  events: {
    pg: 'calendar_events',
    key: 'id',
    cols: {
      ...base,
      title: ['title', 'text'],
      description: ['description', 'text'],
      location: ['location', 'text'],
      allDay: ['all_day', 'boolean'],
      // All-day events store YYYY-MM-DD, timed events an ISO instant, so these stay text.
      start: ['start_at', 'text'],
      end: ['end_at', 'text'],
      timezone: ['timezone', 'text'],
      category: ['category', 'text'],
      reminders: ['reminders', 'jsonb'],
      rrule: ['rrule', 'text'],
      exdates: ['exdates', 'jsonb'],
      linkedTrackerId: ['linked_tracker_id', 'text'],
      linkedRecordId: ['linked_record_id', 'text'],
      sourceId: ['source_id', 'text'],
      externalUid: ['external_uid', 'text'],
      externalRecurrenceId: ['external_recurrence_id', 'text'],
      externalLastModified: ['external_last_modified', 'text'],
      readOnly: ['read_only', 'boolean'],
    },
    indexes: ['start_at'],
  },
  calendarSources: {
    pg: 'calendar_sources',
    key: 'id',
    cols: {
      ...base,
      name: ['name', 'text'],
      kind: ['kind', 'text'],
      url: ['url', 'text'],
      color: ['color', 'text'],
      direction: ['direction', 'text'],
      lastAttemptAt: ['last_attempt_at', 'timestamptz'],
      lastSyncAt: ['last_sync_at', 'timestamptz'],
      lastError: ['last_error', 'text'],
      lastResult: ['last_result', 'jsonb'],
      autoRefreshMinutes: ['auto_refresh_minutes', 'integer'],
    },
  },
  kv: {
    pg: 'app_kv',
    key: 'key',
    cols: {
      key: ['key', 'text'],
      value: ['value', 'jsonb'],
    },
  },
}

export const TRACKER_SCHEMA = 'tracker_tables'

export function qi(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

function ql(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'"
}

/** CREATE TABLE / INDEX statements (idempotent). */
export function schemaDDL(): string[] {
  const out: string[] = [`CREATE SCHEMA IF NOT EXISTS ${qi(TRACKER_SCHEMA)}`]
  for (const spec of Object.values(TABLES)) {
    const keyCol = spec.cols[spec.key][0]
    const cols = Object.values(spec.cols).map(
      ([col, type]) => `  ${qi(col)} ${type}${col === keyCol ? ' PRIMARY KEY' : ''}`,
    )
    cols.push('  "raw" jsonb NOT NULL', '  "synced_at" timestamptz NOT NULL DEFAULT now()')
    out.push(`CREATE TABLE IF NOT EXISTS ${qi(spec.pg)} (\n${cols.join(',\n')}\n)`)
    // Columns added to a spec later are picked up by existing databases.
    for (const [col, type] of Object.values(spec.cols)) {
      out.push(`ALTER TABLE ${qi(spec.pg)} ADD COLUMN IF NOT EXISTS ${qi(col)} ${type}`)
    }
    for (const col of spec.indexes ?? []) {
      out.push(`CREATE INDEX IF NOT EXISTS ${qi(`${spec.pg}_${col}_idx`)} ON ${qi(spec.pg)} (${qi(col)})`)
    }
  }
  return out
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Converts one JS value to a pg parameter for the given column type; invalid values become null. */
export function toPg(value: unknown, type: PgType): unknown {
  if (value === undefined || value === null) return null
  switch (type) {
    case 'jsonb':
      return JSON.stringify(value)
    case 'text':
      return typeof value === 'string' ? value : JSON.stringify(value)
    case 'boolean':
      return typeof value === 'boolean' ? value : null
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
    case 'numeric':
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    case 'date':
      return typeof value === 'string' && DATE_RE.test(value) ? value : null
    case 'timestamptz':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
  }
}

/** Builds a multi-row upsert for `rows` of one table. */
export function upsertSQL(table: string, rows: Record<string, unknown>[]): { text: string; values: unknown[] } {
  const spec = TABLES[table]
  if (!spec) throw new Error(`Unknown table "${table}"`)
  const entries = Object.entries(spec.cols)
  const colNames = [...entries.map(([, [col]]) => col), 'raw']
  const values: unknown[] = []
  const tuples = rows.map((row) => {
    const ph = entries.map(([field, [, type]]) => {
      values.push(toPg(row[field], type))
      return `$${values.length}${type === 'jsonb' ? '::jsonb' : ''}`
    })
    values.push(JSON.stringify(row))
    ph.push(`$${values.length}::jsonb`)
    return `(${ph.join(', ')})`
  })
  const keyCol = spec.cols[spec.key][0]
  const updates = colNames
    .filter((c) => c !== keyCol)
    .map((c) => `${qi(c)} = EXCLUDED.${qi(c)}`)
    .concat('"synced_at" = now()')
  const text =
    `INSERT INTO ${qi(spec.pg)} (${colNames.map(qi).join(', ')}) VALUES ${tuples.join(', ')} ` +
    `ON CONFLICT (${qi(keyCol)}) DO UPDATE SET ${updates.join(', ')}`
  return { text, values }
}

/* ───────────── Per-tracker views ───────────── */

interface FieldLike {
  id: string
  name: string
  type: string
}

export interface TrackerLike {
  id: string
  name: string
  fields?: FieldLike[]
  sessionFields?: FieldLike[]
}

/** Lowercase snake_case identifier, max 48 chars, never empty, never starting with a digit. */
export function slugify(name: string, fallback: string): string {
  let s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .replace(/_+$/, '')
  if (!s) s = fallback
  if (/^\d/.test(s)) s = 't_' + s
  return s
}

function uniqueName(want: string, used: Set<string>): string {
  let name = want
  for (let i = 2; used.has(name); i++) name = `${want}_${i}`
  used.add(name)
  return name
}

/** Typed extraction of one custom field from a jsonb column; bad values become NULL instead of failing. */
export function fieldExpr(jsonCol: string, field: FieldLike): string {
  const raw = `${qi(jsonCol)} -> ${ql(field.id)}`
  const txt = `${qi(jsonCol)} ->> ${ql(field.id)}`
  switch (field.type) {
    case 'number':
    case 'currency':
      return `CASE WHEN jsonb_typeof(${raw}) = 'number' THEN (${txt})::numeric END`
    case 'checkbox':
      return `CASE WHEN jsonb_typeof(${raw}) = 'boolean' THEN (${txt})::boolean END`
    case 'date':
      return `CASE WHEN (${txt}) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (${txt})::date END`
    default:
      return `NULLIF(${txt}, '')`
  }
}

const RECORD_BASE = ['id', 'kind', 'title', 'status', 'category', 'progress', 'deadline', 'record_date', 'notes']
const SESSION_BASE = ['id', 'record_id', 'session_date', 'minutes', 'count', 'title', 'notes']

function viewSQL(
  view: string,
  source: string,
  baseCols: string[],
  jsonCol: string,
  fields: FieldLike[],
  trackerId: string,
): string {
  const used = new Set([...baseCols, 'created_at', 'updated_at'])
  const custom = fields.map((f) => `${fieldExpr(jsonCol, f)} AS ${qi(uniqueName(slugify(f.name, 'field'), used))}`)
  const select = [...baseCols.map(qi), ...custom, '"created_at"', '"updated_at"']
  return (
    `CREATE VIEW ${qi(TRACKER_SCHEMA)}.${qi(view)} AS SELECT ${select.join(', ')} ` +
    `FROM ${qi(source)} WHERE "tracker_id" = ${ql(trackerId)}`
  )
}

/**
 * CREATE VIEW statements for every tracker: `<slug>` over its records and `<slug>_sessions`
 * over its learning sessions, with each custom field as its own typed column.
 */
export function trackerViewsSQL(trackers: TrackerLike[]): { name: string; sql: string }[] {
  const used = new Set<string>()
  const out: { name: string; sql: string }[] = []
  const sorted = [...trackers].sort((a, b) => a.id.localeCompare(b.id))
  for (const t of sorted) {
    const slug = uniqueName(slugify(t.name, `tracker_${t.id.slice(0, 8)}`), used)
    const sessions = uniqueName(`${slug}_sessions`, used)
    out.push({ name: slug, sql: viewSQL(slug, 'tracker_records', RECORD_BASE, 'field_values', t.fields ?? [], t.id) })
    out.push({ name: sessions, sql: viewSQL(sessions, 'learning_sessions', SESSION_BASE, 'attrs', t.sessionFields ?? [], t.id) })
  }
  return out
}
