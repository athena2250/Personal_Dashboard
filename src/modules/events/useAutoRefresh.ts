import { useEffect } from 'react'
import { db } from '@/data/db'
import { proxyAvailable, subscriptionAdapter } from '@/integrations/calendar'

/**
 * Refreshes read-only calendar subscriptions on their configured interval while the app is open.
 * Failures are recorded on the source (shown on the Events and Sync pages) — never silently ignored.
 */
export function useSubscriptionAutoRefresh() {
  useEffect(() => {
    let cancelled = false
    let hasProxy: boolean | null = null
    const tick = async () => {
      const sources = await db.calendarSources.filter((s) => s.kind === 'subscription' && s.autoRefreshMinutes > 0).toArray()
      if (!sources.length || cancelled) return
      hasProxy ??= await proxyAvailable()
      if (!hasProxy) return
      for (const s of sources) {
        const last = s.lastAttemptAt ? Date.parse(s.lastAttemptAt) : 0
        if (Date.now() - last < s.autoRefreshMinutes * 60_000) continue
        try {
          await subscriptionAdapter.pull!(s)
        } catch {
          /* error stored on the source by the adapter */
        }
      }
    }
    const first = setTimeout(tick, 4000)
    const id = setInterval(tick, 5 * 60_000)
    return () => {
      cancelled = true
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])
}
