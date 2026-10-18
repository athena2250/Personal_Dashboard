/**
 * Opt-in demo data. Every row is flagged `demo: true` and names are prefixed so it is obvious.
 * `removeDemoData()` deletes exactly those rows and nothing else.
 */
import { db, DEMO_TABLES } from './db'
import type { Budget, CalendarEvent, Investment, InvestmentTxn, LearningSession, RecurringRule, Task, TrackerRecord, Transaction, Valuation } from './models'
import { TOTAL_BUDGET } from './models'
import { tracked } from './saveStatus'
import { stamp } from './repos/base'
import { addDays, addMonths, monthKey, type ISODate } from '@/lib/dates'
import { getAppTimezone, zonedToUtc } from '@/lib/tz'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export function loadDemoData(today: ISODate, baseCurrency: string) {
  return tracked(async () => {
    const r = rng(42)
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
    const demo = true as const

    // Learning sessions over ~6 months
    const sessions: LearningSession[] = []
    const langs = ['Python', 'TypeScript', 'SQL', 'Go']
    const topics = ['Arrays', 'Graphs', 'Dynamic programming', 'Trees', 'Hashing', 'Sliding window']
    const areas = ['Machine Learning', 'Deep Learning', 'Generative AI', 'Agentic AI']
    const sections = ['GRE Verbal', 'GRE Quant', 'TOEFL Reading', 'TOEFL Listening']
    for (let i = 180; i >= 0; i--) {
      const d = addDays(today, -i)
      if (r() < 0.62) {
        const n = Math.floor(r() * 4)
        sessions.push(
          stamp<LearningSession>({ demo, trackerId: 'coding', date: d, minutes: 20 + Math.floor(r() * 70), title: `${pick(topics)} practice`, count: n, attrs: { language: pick(langs), topic: pick(topics), difficulty: pick(['Easy', 'Medium', 'Medium', 'Hard']), platform: 'LeetCode' } }),
        )
      }
      if (r() < 0.35) sessions.push(stamp<LearningSession>({ demo, trackerId: 'aiml', date: d, minutes: 30 + Math.floor(r() * 60), title: `${pick(areas)} study`, attrs: { area: pick(areas), activity: pick(['Course', 'Reading', 'Project']) } }))
      if (r() < 0.2) sessions.push(stamp<LearningSession>({ demo, trackerId: 'apps', date: d, minutes: 45 + Math.floor(r() * 90), title: 'Build session', attrs: { activity: pick(['Coding', 'Debugging', 'Deployment']) } }))
      if (r() < 0.3) sessions.push(stamp<LearningSession>({ demo, trackerId: 'testprep', date: d, minutes: 25 + Math.floor(r() * 45), title: `${pick(sections)} drills`, count: 10 + Math.floor(r() * 20), attrs: { section: pick(sections), accuracy: 55 + Math.floor(r() * 40) } }))
    }

    const records: TrackerRecord[] = [
      stamp<TrackerRecord>({ demo, trackerId: 'coding', kind: 'item', title: '[Demo] Two Sum', status: 'done', values: { type: 'Problem', url: 'https://leetcode.com/problems/two-sum/', language: 'Python', topic: 'Hashing', difficulty: 'Easy' }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'coding', kind: 'item', title: '[Demo] Course Schedule', status: 'revisit', values: { type: 'Problem', url: 'https://leetcode.com/problems/course-schedule/', language: 'Python', topic: 'Graphs', difficulty: 'Medium' }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'aiml', kind: 'item', title: '[Demo] Deep Learning Specialization', status: 'progress', progress: 45, values: { type: 'Course', area: 'Deep Learning', provider: 'Coursera' }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'aiml', kind: 'item', title: '[Demo] RAG agent prototype', status: 'progress', progress: 30, deadline: addDays(today, 21), values: { type: 'Project', area: 'Agentic AI' }, milestones: [{ id: 'm1', title: 'Ingest docs', done: true }, { id: 'm2', title: 'Tool calling loop', done: false, due: addDays(today, 7) }, { id: 'm3', title: 'Eval harness', done: false }] }),
      stamp<TrackerRecord>({ demo, trackerId: 'aiml', kind: 'item', title: '[Demo] Transformers from scratch', status: 'done', progress: 100, values: { type: 'Concept', area: 'Deep Learning' }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'apps', kind: 'item', title: '[Demo] Expense bot', status: 'active', category: 'Automation', progress: 60, deadline: addDays(today, 14), values: { stack: 'Python, FastAPI, SQLite', repoUrl: 'https://github.com/example/expense-bot', nextAction: 'Add CSV export' }, milestones: [{ id: 'a', title: 'MVP', done: true }, { id: 'b', title: 'Deploy', done: false, due: addDays(today, 10) }] }),
      stamp<TrackerRecord>({ demo, trackerId: 'apps', kind: 'item', title: '[Demo] Portfolio site', status: 'shipped', category: 'Web development', progress: 100, values: { stack: 'Next.js, Tailwind', deployUrl: 'https://example.com' }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'testprep', kind: 'item', title: '[Demo] Geometry — circles', status: 'revise', values: { section: 'GRE Quant', confidence: 'Low', revisionDate: addDays(today, 2) }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'testprep', kind: 'mock', title: '[Demo] GRE mock 1', date: addDays(today, -40), values: { exam: 'GRE', verbal: 152, quant: 158, awa: 3.5 }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'testprep', kind: 'mock', title: '[Demo] GRE mock 2', date: addDays(today, -12), values: { exam: 'GRE', verbal: 155, quant: 161, awa: 4 }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'testprep', kind: 'mock', title: '[Demo] TOEFL mock 1', date: addDays(today, -20), values: { exam: 'TOEFL', reading: 25, listening: 24, speaking: 22, writing: 24 }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'testprep', kind: 'vocab', title: 'Laconic', values: { meaning: 'Using very few words', example: 'His laconic reply ended the debate.', mastered: false, nextReview: today }, milestones: [] }),
      stamp<TrackerRecord>({ demo, trackerId: 'testprep', kind: 'vocab', title: 'Obdurate', values: { meaning: 'Stubbornly refusing to change', mastered: true }, milestones: [] }),
    ]

    const tasks: Task[] = [
      stamp<Task>({ demo, title: '[Demo] Review DP notes', done: false, priority: 'high', dueDate: today, trackerId: 'coding' }),
      stamp<Task>({ demo, title: '[Demo] Pay credit card bill', done: false, priority: 'medium', dueDate: addDays(today, 2) }),
      stamp<Task>({ demo, title: '[Demo] Book TOEFL slot', done: true, priority: 'low', dueDate: addDays(today, -1) }),
    ]

    // Transactions over 4 months
    const txs: Transaction[] = []
    const expenseCats: [string, string, number][] = [
      ['Food & Dining', 'Groceries', 1800],
      ['Food & Dining', 'Restaurants', 900],
      ['Transport', 'Cab', 350],
      ['Shopping', 'Clothing', 2200],
      ['Entertainment', 'Movies', 600],
      ['Health', 'Medicine', 500],
    ]
    for (let m = 3; m >= 0; m--) {
      const mStart = addMonths(today.slice(0, 7) + '-01', -m)
      const last = m === 0 ? today : addDays(addMonths(mStart, 1), -1)
      txs.push(stamp<Transaction>({ demo, date: mStart, type: 'income', amount: 85000, currency: baseCurrency, fxRate: 1, category: 'Salary', merchant: '[Demo] Employer', paymentMethod: 'Bank transfer', tags: [] }))
      txs.push(stamp<Transaction>({ demo, date: addDays(mStart, 2), type: 'expense', amount: 22000, currency: baseCurrency, fxRate: 1, category: 'Housing', subcategory: 'Rent', merchant: '[Demo] Rent', paymentMethod: 'UPI', tags: [] }))
      for (let k = 0; k < 18; k++) {
        const d = addDays(mStart, Math.floor(r() * 28))
        if (d > last) continue
        const [cat, sub, base] = pick(expenseCats)
        txs.push(stamp<Transaction>({ demo, date: d, type: 'expense', amount: Math.round(base * (0.4 + r())), currency: baseCurrency, fxRate: 1, category: cat, subcategory: sub, merchant: `[Demo] ${sub}`, paymentMethod: pick(['UPI', 'Credit card', 'Debit card']), tags: [] }))
      }
    }
    const recurring: RecurringRule[] = [
      stamp<RecurringRule>({ demo, type: 'expense', amount: 649, currency: baseCurrency, fxRate: 1, category: 'Subscriptions', subcategory: 'Streaming', merchant: '[Demo] Streaming plan', paymentMethod: 'Credit card', tags: [], frequency: 'monthly', interval: 1, startDate: addDays(today, 5), nextDate: addDays(today, 5), anchorDay: Number(addDays(today, 5).slice(8)), autoPost: false, active: true }),
      stamp<RecurringRule>({ demo, type: 'expense', amount: 999, currency: baseCurrency, fxRate: 1, category: 'Utilities', subcategory: 'Internet', merchant: '[Demo] Broadband', paymentMethod: 'UPI', tags: [], frequency: 'monthly', interval: 1, startDate: addDays(today, 12), nextDate: addDays(today, 12), anchorDay: Number(addDays(today, 12).slice(8)), autoPost: false, active: true }),
    ]
    const budgets: Budget[] = [
      stamp<Budget>({ demo, category: TOTAL_BUDGET, month: '*', amount: 60000 }),
      stamp<Budget>({ demo, category: 'Food & Dining', month: '*', amount: 12000 }),
      stamp<Budget>({ demo, category: 'Shopping', month: '*', amount: 5000 }),
      stamp<Budget>({ demo, category: 'Transport', month: '*', amount: 3000 }),
    ]

    // Wealth: demo SIP + FD
    const sipStart = addMonths(today.slice(0, 7) + '-05', -14)
    const sip = stamp<Investment>({
      demo,
      name: '[Demo] Flexi Cap Fund SIP',
      provider: 'Groww',
      assetType: 'sip',
      currency: baseCurrency,
      startDate: sipStart,
      isLiability: false,
      links: [],
      archived: false,
      sip: { amount: 5000, frequency: 'monthly', startDate: sipStart, nextDate: sipStart, dayOfMonth: 5, active: true },
    })
    const invTxns: InvestmentTxn[] = []
    let d = sipStart
    while (d <= today) {
      invTxns.push(stamp<InvestmentTxn>({ demo, investmentId: sip.id, date: d, type: 'contribution', amount: 5000, source: 'sip' }))
      d = addMonths(d, 1, 5)
    }
    sip.sip!.nextDate = d
    const fdStart = addMonths(today, -8)
    const fd = stamp<Investment>({ demo, name: '[Demo] HDFC FD', provider: 'HDFC Bank', assetType: 'fd', currency: baseCurrency, startDate: fdStart, interestRate: 7.1, compounding: 'quarterly', maturityDate: addMonths(fdStart, 24), isLiability: false, links: [], archived: false })
    invTxns.push(stamp<InvestmentTxn>({ demo, investmentId: fd.id, date: fdStart, type: 'contribution', amount: 100000, source: 'manual', notes: 'Principal' }))
    const valuations: Valuation[] = [
      stamp<Valuation>({ demo, investmentId: sip.id, date: addMonths(today, -6), value: 47200, source: 'actual', notes: 'Demo statement value' }),
      stamp<Valuation>({ demo, investmentId: sip.id, date: addDays(today, -3), value: invTxns.filter((t) => t.investmentId === sip.id && t.date <= addDays(today, -3)).length * 5000 * 1.08, source: 'actual', notes: 'Demo statement value' }),
    ]

    const tz = getAppTimezone()
    const events: CalendarEvent[] = [
      stamp<CalendarEvent>({ demo, title: '[Demo] Team stand-up', allDay: false, start: zonedToUtc(addDays(today, 1), '10:00', tz), end: zonedToUtc(addDays(today, 1), '10:30', tz), timezone: tz, category: 'work', reminders: [10], rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', readOnly: false }),
      stamp<CalendarEvent>({ demo, title: '[Demo] Developer meetup', allDay: false, start: zonedToUtc(addDays(today, 4), '18:30', tz), end: zonedToUtc(addDays(today, 4), '21:00', tz), timezone: tz, category: 'dev', location: 'Bengaluru', reminders: [60], readOnly: false }),
      stamp<CalendarEvent>({ demo, title: '[Demo] GRE exam', allDay: true, start: addDays(today, 45), end: addDays(today, 45), category: 'exam', reminders: [], readOnly: false, linkedTrackerId: 'testprep' }),
      stamp<CalendarEvent>({ demo, title: '[Demo] Project deadline', allDay: true, start: addDays(today, 10), end: addDays(today, 10), category: 'deadline', reminders: [], readOnly: false, linkedTrackerId: 'apps' }),
    ]

    await db.transaction('rw', DEMO_TABLES.map((t) => db.table(t)), async () => {
      await db.sessions.bulkAdd(sessions)
      await db.records.bulkAdd(records)
      await db.tasks.bulkAdd(tasks)
      await db.transactions.bulkAdd(txs)
      await db.recurring.bulkAdd(recurring)
      await db.budgets.bulkAdd(budgets)
      await db.investments.bulkAdd([sip, fd])
      await db.invTxns.bulkAdd(invTxns)
      await db.valuations.bulkAdd(valuations)
      await db.events.bulkAdd(events)
    })
    return { month: monthKey(today) }
  })
}

export function removeDemoData() {
  return tracked(() =>
    db.transaction('rw', DEMO_TABLES.map((t) => db.table(t)), async () => {
      let n = 0
      for (const t of DEMO_TABLES) {
        const keys = await db.table(t).filter((row: { demo?: boolean }) => row.demo === true).primaryKeys()
        await db.table(t).bulkDelete(keys)
        n += keys.length
      }
      return n
    }),
  )
}
