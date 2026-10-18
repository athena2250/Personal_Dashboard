import { useEffect, useRef } from 'react'
import { db } from '@/data/db'
import { useApp } from '@/app/AppContext'
import { addDays } from '@/lib/dates'
import { getAppTimezone } from '@/lib/tz'
import { buildInstances, instanceStartMs } from './calendarModel'

const FIRED_KEY = 'phq-fired-reminders'

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function saveFired(s: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-500)))
  } catch {
    /* ignore */
  }
}

/**
 * Shows browser notifications for event reminders while the app is open.
 * (Browsers cannot deliver reminders when no tab is open — exported ICS alerts cover that in Apple Calendar.)
 */
export function useReminderNotifications() {
  const { settings, today } = useApp()
  const fired = useRef<Set<string>>(loadFired())
  const enabled = settings.notificationsEnabled

  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const check = async () => {
      const tz = getAppTimezone()
      const events = await db.events.filter((e) => e.reminders?.length > 0).toArray()
      if (!events.length) return
      const instances = buildInstances(events, today, addDays(today, 8), tz, settings.eventCategories)
      const now = Date.now()
      for (const inst of instances) {
        for (const mins of inst.event.reminders) {
          const at = instanceStartMs(inst, tz) - mins * 60_000
          const key = `${inst.key}|${mins}`
          if (at <= now && at > now - 5 * 60_000 && !fired.current.has(key)) {
            fired.current.add(key)
            saveFired(fired.current)
            try {
              new Notification(inst.event.title, {
                body: mins === 0 ? 'Starting now' : `Starts in ${mins >= 1440 ? `${Math.round(mins / 1440)} day(s)` : mins >= 60 ? `${Math.round(mins / 60)} hour(s)` : `${mins} min`}${inst.event.location ? ` · ${inst.event.location}` : ''}`,
                tag: key,
              })
            } catch {
              /* some browsers require a service worker for notifications */
            }
          }
        }
      }
    }
    check()
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [enabled, today, settings.eventCategories])
}
