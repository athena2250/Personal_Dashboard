import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, Database, Sparkles, TrendingUp, X } from 'lucide-react'
import { updateSettings } from '@/data/repos/settings'
import { loadDemoData } from '@/data/demo'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/forms'
import { useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { CURRENCIES } from '@/lib/money'
import { listTimezones } from '@/lib/tz'

/** First-run onboarding card. Dismissing it never creates data. */
export function Onboarding() {
  const { settings, today } = useApp()
  const toast = useToast()
  const [name, setName] = useState(settings.name)
  const [currency, setCurrency] = useState(settings.baseCurrency)
  const [timezone, setTimezone] = useState(settings.timezone)
  const [busy, setBusy] = useState(false)

  const finish = async (withDemo: boolean) => {
    setBusy(true)
    try {
      await updateSettings({ name: name.trim(), baseCurrency: currency, timezone, onboarded: true })
      if (withDemo) {
        await loadDemoData(today, currency)
        toast.success('Demo data loaded — remove it any time from Settings')
      } else toast.success('All set. Your HQ is ready.')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="animate-fade-up relative mb-6 overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6" aria-labelledby="onboarding-title">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[var(--accent)] opacity-20 blur-3xl" />
      <button className="absolute top-4 right-4 text-muted hover:text-fg" aria-label="Dismiss onboarding" onClick={() => updateSettings({ onboarded: true })}>
        <X className="h-4 w-4" />
      </button>
      <div className="relative grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Welcome to Personal HQ
          </div>
          <h2 id="onboarding-title" className="font-display text-2xl font-semibold text-fg">
            Let's set up your HQ
          </h2>
          <p className="mt-1 max-w-lg text-sm text-fg-2">Everything is stored privately in this browser. Nothing is pre-filled — your dashboards calculate only from what you record.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-fg-2">
              Your name
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
            </label>
            <label className="text-xs text-fg-2">
              Base currency
              <Select className="mt-1" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-fg-2">
              Timezone
              <Select className="mt-1" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {listTimezones().map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" loading={busy} onClick={() => finish(false)}>
              Start fresh
            </Button>
            <Button loading={busy} onClick={() => finish(true)} icon={<Database className="h-4 w-4" />}>
              Explore with demo data
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">Demo rows are labelled “[Demo]” and can be removed in one click.</p>
        </div>
        <div className="space-y-2.5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Suggested next steps</p>
          <Link to="/wealth/holdings?add=sip" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-line-strong">
            <TrendingUp className="h-4 w-4 text-wealth" />
            <span className="text-sm text-fg-2">Add your Groww SIPs and HDFC fixed deposit</span>
          </Link>
          <Link to="/events/sync" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-line-strong">
            <CalendarDays className="h-4 w-4 text-events" />
            <span className="text-sm text-fg-2">Connect Apple Calendar (ICS import / subscription)</span>
          </Link>
          <Link to="/trackers/new" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-line-strong">
            <Sparkles className="h-4 w-4 text-learning" />
            <span className="text-sm text-fg-2">Create a custom tracker (books, fitness, certifications…)</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
