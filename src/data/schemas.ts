/**
 * zod schemas used to validate user input before it is persisted.
 */
import { z } from 'zod'
import { isISODate } from '@/lib/dates'
import { ValidationError } from './saveStatus'

const isoDate = z.string().refine((s) => isISODate(s), 'Enter a valid date')
const optDate = z
  .string()
  .optional()
  .refine((s) => !s || isISODate(s), 'Enter a valid date')
const url = z
  .string()
  .optional()
  .refine((s) => {
    if (!s) return true
    try {
      const u = new URL(s)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  }, 'Enter a full URL starting with https://')
const money = z.number({ error: 'Enter an amount' }).finite('Enter an amount')
const currency = z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code')

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: z.string().max(5000).optional(),
  dueDate: optDate,
  priority: z.enum(['low', 'medium', 'high']),
})

export const sessionSchema = z.object({
  trackerId: z.string().min(1, 'Choose a tracker'),
  date: isoDate,
  minutes: z.number().int('Use whole minutes').min(0, 'Minutes cannot be negative').max(24 * 60, 'Max 24 hours per entry'),
  title: z.string().trim().min(1, 'Add a short title').max(200),
  count: z.number().int().min(0).max(100000).optional(),
})

export const recordSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  progress: z.number().min(0).max(100).optional(),
  deadline: optDate,
  date: optDate,
})

export const fieldDefSchema = z.object({
  name: z.string().trim().min(1, 'Field name is required').max(60),
  type: z.enum(['text', 'longtext', 'number', 'date', 'checkbox', 'select', 'url', 'currency']),
  options: z.array(z.string()).optional(),
})

export const trackerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  description: z.string().max(500),
  fields: z.array(fieldDefSchema),
  statuses: z.array(z.object({ name: z.string().trim().min(1, 'Status name is required') })).min(1, 'Add at least one status'),
})

export const transactionSchema = z.object({
  date: isoDate,
  type: z.enum(['income', 'expense']),
  amount: money.positive('Amount must be greater than zero'),
  currency,
  fxRate: z.number().positive('Exchange rate must be positive'),
  category: z.string().trim().min(1, 'Choose a category'),
  merchant: z.string().trim().min(1, 'Add a merchant or description').max(200),
})

export const budgetSchema = z.object({
  category: z.string().min(1),
  month: z.string().regex(/^(\*|\d{4}-\d{2})$/),
  amount: money.min(0, 'Budget cannot be negative'),
})

export const recurringSchema = transactionSchema.omit({ date: true }).extend({
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  interval: z.number().int().min(1).max(24),
  startDate: isoDate,
  endDate: optDate,
})

export const investmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  provider: z.string().trim().max(120),
  assetType: z.enum(['sip', 'mutual_fund', 'fd', 'stock', 'etf', 'cash', 'other']),
  currency,
  startDate: isoDate,
  interestRate: z.number().min(0).max(100).optional(),
  expectedReturn: z.number().min(-100).max(100).optional(),
  maturityDate: optDate,
  maturityAmount: z.number().min(0).optional(),
})

export const invTxnSchema = z.object({
  investmentId: z.string().min(1),
  date: isoDate,
  type: z.enum(['contribution', 'withdrawal', 'income', 'fee']),
  amount: money.positive('Amount must be greater than zero'),
  units: z.number().min(0).optional(),
})

export const valuationSchema = z.object({
  investmentId: z.string().min(1),
  date: isoDate,
  value: money.min(0, 'Value cannot be negative'),
  source: z.enum(['actual', 'estimate']),
})

export const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(300),
    allDay: z.boolean(),
    start: z.string().min(1, 'Start is required'),
    end: z.string().min(1, 'End is required'),
    category: z.string().min(1),
  })
  .refine((e) => e.end >= e.start, { message: 'End must be after start', path: ['end'] })

export const linkSchema = z.object({ label: z.string(), url })

/** Validates `data` with `schema` and throws a ValidationError with field messages. */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const res = schema.safeParse(data)
  if (res.success) return res.data
  const issues: Record<string, string> = {}
  for (const i of res.error.issues) {
    const key = i.path.join('.') || '_'
    if (!issues[key]) issues[key] = i.message
  }
  throw new ValidationError(issues)
}

export { url as urlSchema }
