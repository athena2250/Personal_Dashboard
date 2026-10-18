import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { ArrowDown, ArrowUp, Database, Download, Eye, EyeOff, HardDrive, Plus, Settings as SettingsIcon, Trash2, Upload } from 'lucide-react'
import type { EventCategory, Settings, WidgetPref } from '@/data/models'
import { updateSettings } from '@/data/repos/settings'
import { createBackup, eraseAllData, parseBackup, restoreBackup, type BackupFile, type BackupPreview } from '@/data/backup'
import { loadDemoData, removeDemoData } from '@/data/demo'
import { useDemoCount } from '@/data/hooks'
import { ensureInitialized } from '@/data/repos/settings'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardBody, CardHeader, PageHeader, Segmented } from '@/components/ui/display'
import { Field, Input, LabeledInput, LabeledSelect, Toggle } from '@/components/ui/forms'
import { Modal } from '@/components/ui/Modal'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { CURRENCIES } from '@/lib/money'
import { listTimezones } from '@/lib/tz'
import { downloadFile, slug } from '@/lib/util'
import { WIDGET_META } from '@/modules/home/HomePage'

export function SettingsPage() {
  const { settings, today } = useApp()
  const toast = useToast()
  const confirm = useConfirm()
  const location = useLocation()
  const demoCount = useDemoCount()
  const [name, setName] = useState(settings.name)
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null)
  const [restore, setRestore] = useState<{ backup: BackupFile; preview: BackupPreview; fileName: string } | null>(null)
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [location.hash])

  useEffect(() => {
    ;(async () => {
      try {
        const est = await navigator.storage?.estimate?.()
        const persisted = await navigator.storage?.persisted?.()
        setStorage({ usage: est?.usage, quota: est?.quota, persisted })
      } catch {
        setStorage({})
      }
    })()
  }, [])

  const save = (patch: Partial<Settings>, msg = 'Settings saved') =>
    updateSettings(patch)
      .then(() => toast.success(msg))
      .catch(toast.error)

  const doBackup = async () => {
    try {
      const b = await createBackup()
      downloadFile(`personal-hq-backup-${today}.json`, JSON.stringify(b, null, 2), 'application/json')
      toast.success('Backup downloaded. Keep it somewhere safe (e.g. iCloud Drive).')
    } catch (e) {
      toast.error(e)
    }
  }

  const onRestoreFile = async (f: File) => {
    try {
      const { backup, preview } = parseBackup(await f.text())
      setRestore({ backup, preview, fileName: f.name })
    } catch (e) {
      toast.error(e)
    }
  }

  const doRestore = async () => {
    if (!restore) return
    if (restoreMode === 'replace' && !(await confirm({ title: 'Replace all data?', message: 'Everything currently stored will be erased and replaced with the backup. Download a backup of the current data first if unsure.', confirmLabel: 'Replace everything', danger: true, typeToConfirm: 'REPLACE' }))) return
    setBusy(true)
    try {
      await restoreBackup(restore.backup, restoreMode)
      await ensureInitialized()
      toast.success('Backup restored')
      setRestore(null)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  const moveWidget = (i: number, d: -1 | 1) => {
    const w = [...settings.dashboardWidgets]
    const j = i + d
    if (j < 0 || j >= w.length) return
    ;[w[i], w[j]] = [w[j], w[i]]
    save({ dashboardWidgets: w }, 'Dashboard layout saved')
  }

  const mb = (n?: number) => (n == null ? '—' : n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${(n / 1e6).toFixed(1)} MB`)

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader title="Settings" subtitle="Preferences, dashboard, categories, and your data." icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent"><SettingsIcon className="h-6 w-6" /></span>} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile & appearance" />
          <CardBody className="space-y-4">
            <div className="flex items-end gap-2">
              <LabeledInput label="Your name (for greetings)" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
              <Button onClick={() => save({ name: name.trim() })} disabled={name === settings.name}>
                Save
              </Button>
            </div>
            <Field label="Theme">
              <Segmented
                value={settings.theme}
                onChange={(v) => save({ theme: v }, 'Theme updated')}
                options={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                  { value: 'system', label: 'System' },
                ]}
              />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Regional" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <LabeledSelect label="Default (base) currency" value={settings.baseCurrency} onChange={(e) => save({ baseCurrency: e.target.value })} hint="Totals are reported in this currency. Existing amounts are not converted.">
              {[...new Set([settings.baseCurrency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </LabeledSelect>
            <LabeledSelect label="Timezone" value={settings.timezone} onChange={(e) => save({ timezone: e.target.value })} hint="Used for 'today', streaks and calendar times.">
              {listTimezones().map((t) => (
                <option key={t}>{t}</option>
              ))}
            </LabeledSelect>
            <LabeledSelect label="Week starts on" value={String(settings.weekStartsOn)} onChange={(e) => save({ weekStartsOn: Number(e.target.value) as 0 | 1 })}>
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </LabeledSelect>
            <LabeledSelect label="Budget warning at" value={String(settings.budgetWarnThreshold)} onChange={(e) => save({ budgetWarnThreshold: Number(e.target.value) })}>
              {[0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map((v) => (
                <option key={v} value={v}>
                  {Math.round(v * 100)}% of budget
                </option>
              ))}
            </LabeledSelect>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dashboard widgets" subtitle="Show, hide and reorder the overview widgets (or use Customize on the overview)" />
          <ul className="divide-y divide-line">
            {settings.dashboardWidgets.map((w: WidgetPref, i) => (
              <li key={w.id} className="flex items-center gap-2 px-5 py-2">
                <span className={`flex-1 text-sm ${w.visible ? 'text-fg' : 'text-muted line-through'}`}>{WIDGET_META[w.id].label}</span>
                <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => moveWidget(i, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === settings.dashboardWidgets.length - 1} onClick={() => moveWidget(i, 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={w.visible ? 'Hide' : 'Show'} onClick={() => save({ dashboardWidgets: settings.dashboardWidgets.map((x) => (x.id === w.id ? { ...x, visible: !x.visible } : x)) }, 'Dashboard layout saved')}>
                  {w.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <PaymentMethods settings={settings} />
          <Card>
            <CardHeader title="Notifications" />
            <CardBody>
              <Toggle
                label="Event reminder notifications"
                description={typeof Notification === 'undefined' ? 'Not supported in this browser.' : Notification.permission === 'denied' ? 'Blocked in browser settings — allow notifications for this site to enable.' : 'Shown while Personal HQ is open in a tab. For reminders when it is closed, export events to Apple Calendar.'}
                checked={settings.notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted'}
                onChange={async (v) => {
                  if (!v) return save({ notificationsEnabled: false }, 'Notifications off')
                  if (typeof Notification === 'undefined') return toast.error('Notifications are not supported in this browser.')
                  const p = await Notification.requestPermission()
                  if (p === 'granted') save({ notificationsEnabled: true }, 'Notifications on')
                  else toast.error('Permission was not granted, so notifications stay off.')
                }}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <EventCategories settings={settings} />

      <Card id="data">
        <CardHeader title="Storage & demo data" icon={<HardDrive className="h-4 w-4 text-muted" />} />
        <CardBody className="space-y-4 text-sm">
          <p className="text-fg-2">
            All data is stored locally in this browser's IndexedDB (database “personal-hq”). It is not uploaded anywhere. Using another browser or device starts empty — move data with backup & restore.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Badge>Used: {mb(storage?.usage)}</Badge>
            <Badge>Available: {mb(storage?.quota)}</Badge>
            {storage?.persisted ? (
              <Badge tone="good">Persistent storage granted</Badge>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const ok = await navigator.storage?.persist?.()
                  setStorage((s) => ({ ...s, persisted: !!ok }))
                  if (ok) toast.success('The browser will not evict your data automatically.')
                  else toast.info('The browser declined persistent storage. Keep regular backups.')
                }}
              >
                Request persistent storage
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Database className="h-4 w-4 text-muted" />
            <span className="flex-1 text-fg-2">{demoCount ? `${demoCount} demo rows are loaded (labelled “[Demo]”).` : 'No demo data loaded.'}</span>
            {demoCount ? (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (!(await confirm({ title: 'Remove demo data?', message: 'Only rows flagged as demo are deleted. Your own records are untouched.', confirmLabel: 'Remove demo data', danger: true }))) return
                  removeDemoData()
                    .then((n) => toast.success(`Removed ${n} demo rows`))
                    .catch(toast.error)
                }}
              >
                Remove demo data
              </Button>
            ) : (
              <Button size="sm" onClick={() => loadDemoData(today, settings.baseCurrency).then(() => toast.success('Demo data loaded')).catch(toast.error)}>
                Load demo data
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card id="backup">
        <CardHeader title="Backup & restore" subtitle="A single JSON file with everything: trackers, sessions, transactions, budgets, investments, events and settings." />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={doBackup}>
              Download backup
            </Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-sm font-medium text-fg hover:bg-surface-3">
              <Upload className="h-4 w-4" /> Restore from file…
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && onRestoreFile(e.target.files[0])} />
            </label>
          </div>
          <p className="text-xs text-muted">Backups contain your private financial data — store them somewhere you trust. CSV exports for individual modules are available on each dashboard.</p>
          <div className="border-t border-line pt-4">
            <Button
              variant="ghost"
              className="text-bad-fg"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={async () => {
                if (!(await confirm({ title: 'Erase all data?', message: 'This permanently deletes everything stored in Personal HQ in this browser. Default trackers and categories are recreated. Download a backup first.', confirmLabel: 'Erase everything', danger: true, typeToConfirm: 'ERASE' }))) return
                try {
                  await eraseAllData()
                  await ensureInitialized()
                  toast.success('All data erased')
                } catch (e) {
                  toast.error(e)
                }
              }}
            >
              Erase all data…
            </Button>
          </div>
        </CardBody>
      </Card>

      <Modal open={!!restore} onClose={() => setRestore(null)} title="Restore backup" size="sm">
        {restore && (
          <div className="space-y-4 text-sm">
            <p className="text-fg-2">
              <strong className="text-fg">{restore.fileName}</strong>, created {new Date(restore.preview.exportedAt).toLocaleString()}.
            </p>
            <ul className="grid grid-cols-2 gap-1 text-xs text-fg-2">
              {Object.entries(restore.preview.counts).map(([k, v]) => (
                <li key={k}>
                  {k}: <span className="text-fg">{v}</span>
                </li>
              ))}
            </ul>
            <Segmented value={restoreMode} onChange={setRestoreMode} options={[{ value: 'merge', label: 'Merge' }, { value: 'replace', label: 'Replace all' }]} />
            <p className="text-xs text-muted">{restoreMode === 'merge' ? 'Rows from the backup are added or updated by ID; nothing is deleted.' : 'All current data is erased first, then the backup is loaded.'}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRestore(null)}>
                Cancel
              </Button>
              <Button variant={restoreMode === 'replace' ? 'danger' : 'primary'} loading={busy} onClick={doRestore}>
                Restore
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <p className="pb-4 text-center text-xs text-muted">Personal HQ v1.0 · local-first · schema v{settings.schemaVersion}</p>
    </div>
  )
}

function PaymentMethods({ settings }: { settings: Settings }) {
  const toast = useToast()
  const [v, setV] = useState('')
  const save = (paymentMethods: string[]) => updateSettings({ paymentMethods }).catch(toast.error)
  return (
    <Card>
      <CardHeader title="Payment methods" />
      <CardBody>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {settings.paymentMethods.map((m) => (
            <span key={m} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-fg-2">
              {m}
              <button aria-label={`Remove ${m}`} className="text-muted hover:text-bad-fg" onClick={() => save(settings.paymentMethods.filter((x) => x !== m))}>
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (v.trim() && !settings.paymentMethods.includes(v.trim())) save([...settings.paymentMethods, v.trim()])
            setV('')
          }}
        >
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. HDFC Credit Card" aria-label="New payment method" />
          <Button type="submit" icon={<Plus className="h-4 w-4" />}>
            Add
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function EventCategories({ settings }: { settings: Settings }) {
  const toast = useToast()
  const [cats, setCats] = useState<EventCategory[]>(settings.eventCategories)
  const dirty = JSON.stringify(cats) !== JSON.stringify(settings.eventCategories)
  return (
    <Card>
      <CardHeader title="Event categories" subtitle="Colours used across the calendar" action={dirty && <Button size="sm" variant="primary" onClick={() => {
        if (cats.some((c) => !c.name.trim())) return toast.error('Every category needs a name')
        updateSettings({ eventCategories: cats.map((c) => ({ ...c, name: c.name.trim() })) }).then(() => toast.success('Event categories saved')).catch(toast.error)
      }}>Save</Button>} />
      <CardBody>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <input type="color" value={c.color} onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-transparent" aria-label={`${c.name} colour`} />
              <Input value={c.name} onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Category name" />
              <Button size="icon" variant="ghost" aria-label={`Remove ${c.name}`} disabled={cats.length <= 1 || c.id === 'imported'} onClick={() => setCats(cats.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="mt-3" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCats([...cats, { id: slug('cat-' + Date.now().toString(36)), name: 'New category', color: '#64748b' }])}>
          Add category
        </Button>
        <p className="mt-2 text-xs text-muted">Events in a removed category keep their data and appear grey until reassigned.</p>
      </CardBody>
    </Card>
  )
}
