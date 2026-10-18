/**
 * Reactive read hooks (Dexie liveQuery). Components re-render when the underlying tables change.
 * `undefined` means "still loading".
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { DEMO_TABLES } from './db'
import type { Settings } from './models'

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get('settings'), [])
}

export function useTrackers(opts: { includeArchived?: boolean } = {}) {
  return useLiveQuery(async () => {
    const all = await db.trackers.orderBy('order').toArray()
    return opts.includeArchived ? all : all.filter((t) => !t.archived)
  }, [opts.includeArchived])
}

export function useTracker(id: string | undefined) {
  return useLiveQuery(() => (id ? db.trackers.get(id) : undefined), [id])
}

export function useSessions(trackerId?: string) {
  return useLiveQuery(
    () => (trackerId ? db.sessions.where('trackerId').equals(trackerId).toArray() : db.sessions.toArray()),
    [trackerId],
  )
}

export function useRecords(trackerId?: string, kind?: string) {
  return useLiveQuery(async () => {
    if (!trackerId) return db.records.toArray()
    if (kind) return db.records.where('[trackerId+kind]').equals([trackerId, kind]).toArray()
    return db.records.where('trackerId').equals(trackerId).toArray()
  }, [trackerId, kind])
}

export function useTasks() {
  return useLiveQuery(() => db.tasks.toArray(), [])
}

export function useTransactions() {
  return useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [])
}

export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy('name').toArray(), [])
}

export function useBudgets() {
  return useLiveQuery(() => db.budgets.toArray(), [])
}

export function useRecurring() {
  return useLiveQuery(() => db.recurring.orderBy('nextDate').toArray(), [])
}

export function useInvestments() {
  return useLiveQuery(() => db.investments.toArray(), [])
}

export function useInvTxns(investmentId?: string) {
  return useLiveQuery(
    () => (investmentId ? db.invTxns.where('investmentId').equals(investmentId).toArray() : db.invTxns.toArray()),
    [investmentId],
  )
}

export function useValuations(investmentId?: string) {
  return useLiveQuery(
    () => (investmentId ? db.valuations.where('investmentId').equals(investmentId).toArray() : db.valuations.toArray()),
    [investmentId],
  )
}

export function useEvents() {
  return useLiveQuery(() => db.events.toArray(), [])
}

export function useCalendarSources() {
  return useLiveQuery(() => db.calendarSources.toArray(), [])
}

export function useDemoCount() {
  return useLiveQuery(async () => {
    let n = 0
    for (const t of DEMO_TABLES) n += await db.table(t).filter((r: { demo?: boolean }) => r.demo === true).count()
    return n
  }, [])
}
