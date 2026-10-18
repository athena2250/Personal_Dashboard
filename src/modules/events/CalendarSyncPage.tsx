import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarDays, CheckCircle2, ExternalLink, FileDown, FileUp, Info, Link2, Loader2, Lock, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import type { CalendarSource } from '@/data/models'
import { useCalendarSources, useEvents } from '@/data/hooks'
import { addSource, deleteSource, updateSource } from '@/data/repos/events'
import { exportICS, importICSFile, looksLikeAppleShareLink, previewICS, proxyAvailable, subscriptionAdapter } from '@/integrations/calendar'
import type { ParsedCalendar } from '@/domain/ics'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, Card, CardBody, CardHeader, Loading, PageHeader } from '@/components/ui/display'
import { Field, Input, LabeledInput, LabeledSelect, Select } from '@/components/ui/forms'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { formatDate } from '@/lib/dates'
import { downloadFile, cn } from '@/lib/util'
import { getAppTimezone } from '@/lib/tz'

function ago(iso?: string) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`
  return new Date(iso).toLocaleString()
}

export function CalendarSyncPage() {
  const { settings, today } = useApp()
  const sources = useCalendarSources()
  const events = useEvents()
  const toast = useToast()
  const confirm = useConfirm()
  const [proxy, setProxy] = useState<boolean | null>(null)
  const [file, setFile] = useState<{ name: string; text: string; parsed: ParsedCalendar } | null>(null)
  const [importCat, setImportCat] = useState('imported')
  const [importing, setImporting] = useState(false)
  const [subName, setSubName] = useState('iCloud calendar')
  const [subUrl, setSubUrl] = useState('')
  const [subRefresh, setSubRefresh] = useState('60')
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [exportScope, setExportScope] = useState<'local' | 'all' | 'upcoming'>('local')
  const [exportCat, setExportCat] = useState('')

  useEffect(() => {
    proxyAvailable().then(setProxy)
  }, [])

  if (!sources || !events) return <Loading />
  const subs = sources.filter((s) => s.kind === 'subscription')
  const fileSource = sources.find((s) => s.kind === 'ics-file')
  const catName = (id: string) => settings.eventCategories.find((c) => c.id === id)?.name

  const onFile = async (f: File) => {
    try {
      const text = await f.text()
      const parsed = previewICS(text)
      if (!parsed.events.length) throw new Error(parsed.warnings[0] ?? 'No events found in this file.')
      setFile({ name: f.name, text, parsed })
    } catch (e) {
      toast.error(e)
    }
  }

  const doImport = async () => {
    if (!file) return
    setImporting(true)
    try {
      const r = await importICSFile(file.text, importCat)
      toast.success(`Imported: ${r.added} new, ${r.updated} updated, ${r.unchanged} unchanged${r.skippedLocal ? `, ${r.skippedLocal} already in Personal HQ` : ''}${r.removed ? `, ${r.removed} cancelled removed` : ''}.`)
      setFile(null)
    } catch (e) {
      toast.error(e)
    } finally {
      setImporting(false)
    }
  }

  const exportEvents = () => {
    let list = events.filter((e) => !e.readOnly)
    if (exportScope === 'local') list = list.filter((e) => !e.sourceId)
    if (exportScope === 'upcoming') list = list.filter((e) => e.rrule || (e.allDay ? e.end : e.end.slice(0, 10)) >= today)
    if (exportCat) list = list.filter((e) => e.category === exportCat)
    if (!list.length) return toast.error('No events match this export selection.')
    downloadFile(`personal-hq-events-${today}.ics`, exportICS(list, catName), 'text/calendar')
    toast.success(`Exported ${list.length} event${list.length === 1 ? '' : 's'}. Open the file to add them to Apple Calendar.`)
  }

  const sync = async (s: CalendarSource) => {
    setSyncing(s.id)
    try {
      const r = await subscriptionAdapter.pull!(s)
      toast.success(`${s.name}: ${r.added} added, ${r.updated} updated, ${r.removed} removed, ${r.unchanged} unchanged`)
    } catch (e) {
      toast.error(e)
    } finally {
      setSyncing(null)
    }
  }

  const addSub = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^(webcal|https):\/\//i.test(subUrl.trim())) return toast.error('Paste the full link starting with webcal:// or https://')
    setAdding(true)
    try {
      const s = await addSource({ name: subName.trim() || 'Subscribed calendar', kind: 'subscription', url: subUrl.trim(), color: '#64748b', autoRefreshMinutes: Number(subRefresh) })
      setSubUrl('')
      await sync(s)
    } catch (err) {
      toast.error(err)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="Events Calendar"
        title="Apple Calendar & ICS"
        subtitle="Connect Personal HQ with Apple Calendar using standard, secure methods. No Apple ID password is ever requested or stored."
        icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-events-soft text-events"><CalendarDays className="h-6 w-6" /></span>}
        actions={<ButtonLink to="/events" size="sm">Back to calendar</ButtonLink>}
      />

      <Card>
        <CardHeader title="What's supported" icon={<ShieldCheck className="h-4 w-4 text-good-fg" />} />
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { icon: ArrowDownToLine, title: 'ICS import', mode: 'One-time, editable copies', body: 'Export a calendar from Apple Calendar (File → Export) and import it here. Re-importing updates events by UID instead of duplicating them.' },
              { icon: ArrowUpFromLine, title: 'ICS export', mode: 'One-time, to Apple Calendar', body: 'Download a .ics file and open it on your Mac/iPhone to add events to Apple Calendar, including alerts and repeats.' },
              { icon: Link2, title: 'Subscription', mode: 'Automatic, read-only', body: 'Paste a public iCloud calendar link. Personal HQ refreshes it via the local proxy and mirrors changes. Events are view-only here.' },
            ].map((x) => (
              <div key={x.title} className="rounded-xl border border-line p-3.5">
                <x.icon className="mb-2 h-5 w-5 text-events" />
                <p className="text-sm font-medium text-fg">{x.title}</p>
                <Badge tone="events" className="mt-1">{x.mode}</Badge>
                <p className="mt-2 text-xs text-fg-2">{x.body}</p>
              </div>
            ))}
          </div>
          <details className="mt-4 rounded-xl bg-surface-2/60 p-3 text-xs text-fg-2">
            <summary className="cursor-pointer font-medium text-fg">Why there's no two-way automatic sync (yet)</summary>
            <div className="mt-2 space-y-2">
              <p>Apple Calendar on iCloud is reachable only through CalDAV, which has no OAuth sign-in. It requires your Apple ID plus an app-specific password. Storing that in a browser app (or sending it to a third-party server) isn't safe, so Personal HQ doesn't do it.</p>
              <p>Secure ways to add two-way sync later: (1) a small native macOS/iOS companion app using Apple's EventKit, which asks for Calendar permission through the OS; or (2) a self-hosted backend that stores an app-specific password in server-side secret storage and talks CalDAV. The calendar integration is modular (<code>src/integrations/calendar.ts</code>, <code>CalendarAdapter</code>) so either can be added without changing the UI.</p>
              <p>Until then: imported and created events live here; use export to push them to Apple Calendar, and subscriptions to pull Apple changes in automatically (read-only).</p>
            </div>
          </details>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Import an .ics file" subtitle={fileSource?.lastSyncAt ? `Last import ${ago(fileSource.lastSyncAt)}` : 'From Apple Calendar: select a calendar → File → Export → Export…'} icon={<FileUp className="h-4 w-4 text-muted" />} />
          <CardBody className="space-y-3">
            {!file ? (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-4 py-8 text-center hover:border-[var(--events)]">
                <FileUp className="h-6 w-6 text-muted" />
                <span className="text-sm text-fg">Choose a .ics file</span>
                <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
            ) : (
              <>
                <div className="rounded-xl bg-surface-2/60 p-3 text-xs text-fg-2">
                  <p className="font-medium text-fg">{file.name}</p>
                  <p>
                    {file.parsed.events.length} events{file.parsed.name ? ` · calendar “${file.parsed.name}”` : ''}
                    {file.parsed.events.filter((e) => e.rrule).length ? ` · ${file.parsed.events.filter((e) => e.rrule).length} recurring` : ''}
                  </p>
                  <p>
                    Times converted to {getAppTimezone()}
                    {file.parsed.timezone ? ` (calendar zone: ${file.parsed.timezone})` : ''}.
                  </p>
                  {file.parsed.warnings.length > 0 && <p className="mt-1 text-warn">{file.parsed.warnings.length} warning(s): {file.parsed.warnings[0]}</p>}
                  <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto">
                    {file.parsed.events.slice(0, 8).map((e) => (
                      <li key={e.uid + (e.recurrenceId ?? '')}>
                        · {e.title} — {formatDate(e.allDay ? e.start : e.start.slice(0, 10))}
                      </li>
                    ))}
                  </ul>
                </div>
                <LabeledSelect label="Category for new events" value={importCat} onChange={(e) => setImportCat(e.target.value)}>
                  {settings.eventCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </LabeledSelect>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setFile(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={importing} onClick={doImport}>
                    Import {file.parsed.events.length} events
                  </Button>
                </div>
              </>
            )}
            {fileSource?.lastResult && <p className="text-xs text-muted">Last import: {fileSource.lastResult.added} added, {fileSource.lastResult.updated} updated, {fileSource.lastResult.unchanged} unchanged.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Export to Apple Calendar" subtitle="Download a .ics file, then open it (double-click on Mac, or AirDrop/email to iPhone)" icon={<FileDown className="h-4 w-4 text-muted" />} />
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledSelect label="Which events" value={exportScope} onChange={(e) => setExportScope(e.target.value as typeof exportScope)}>
                <option value="local">Created in Personal HQ</option>
                <option value="upcoming">Upcoming (incl. imported)</option>
                <option value="all">All editable events</option>
              </LabeledSelect>
              <LabeledSelect label="Category" value={exportCat} onChange={(e) => setExportCat(e.target.value)}>
                <option value="">All categories</option>
                {settings.eventCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </LabeledSelect>
            </div>
            <Button variant="primary" icon={<FileDown className="h-4 w-4" />} onClick={exportEvents}>
              Download .ics
            </Button>
            <p className="text-xs text-muted">Each event keeps a stable UID, so re-exporting and re-opening updates existing events in Apple Calendar instead of creating copies. Subscribed (read-only) events are never exported back.</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Calendar subscriptions"
          subtitle="Read-only · events update automatically from Apple Calendar"
          icon={<Link2 className="h-4 w-4 text-muted" />}
          action={
            proxy == null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
            ) : proxy ? (
              <Badge tone="good"><CheckCircle2 className="h-3 w-3" /> Local proxy running</Badge>
            ) : (
              <Badge tone="bad"><XCircle className="h-3 w-3" /> Proxy unavailable</Badge>
            )
          }
        />
        <CardBody className="space-y-4">
          {proxy === false && (
            <p className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
              Subscriptions need the small local proxy that ships with Personal HQ (browsers block direct requests to iCloud). Run the app with <code>npm run dev</code> or <code>npm run preview</code>. ICS import/export still work everywhere.
            </p>
          )}
          <details className="rounded-xl bg-surface-2/60 p-3 text-xs text-fg-2">
            <summary className="cursor-pointer font-medium text-fg">How to get a subscription link from Apple Calendar</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>On Mac: Calendar → right-click an iCloud calendar → <em>Share Calendar…</em> → tick <em>Public Calendar</em> → copy the webcal:// link. (iPhone: Calendars → ⓘ → Public Calendar → Share Link.)</li>
              <li>Paste it below. Anyone with the link can read that calendar, so treat it like a password. It's stored only in this browser and sent only to Apple through your local proxy.</li>
              <li>To stop sharing, turn off Public Calendar in Apple Calendar; the next refresh will show an error here.</li>
            </ol>
          </details>
          <form onSubmit={addSub} className="grid gap-3 md:grid-cols-[1fr_2fr_auto_auto] md:items-end">
            <LabeledInput label="Name" value={subName} onChange={(e) => setSubName(e.target.value)} />
            <Field label="Public calendar link" hint={subUrl && !looksLikeAppleShareLink(subUrl) ? 'This does not look like an iCloud link; non-iCloud hosts must be allow-listed on the proxy.' : undefined}>
              <Input value={subUrl} onChange={(e) => setSubUrl(e.target.value)} placeholder="webcal://p01-caldav.icloud.com/published/2/…" type="text" autoComplete="off" spellCheck={false} />
            </Field>
            <LabeledSelect label="Refresh" value={subRefresh} onChange={(e) => setSubRefresh(e.target.value)}>
              <option value="0">Manual</option>
              <option value="30">Every 30 min</option>
              <option value="60">Hourly</option>
              <option value="360">Every 6 h</option>
            </LabeledSelect>
            <Button type="submit" variant="primary" loading={adding} disabled={!proxy || !subUrl.trim()}>
              Subscribe
            </Button>
          </form>
          {subs.length === 0 ? (
            <p className="text-xs text-muted">No subscriptions yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {subs.map((s) => {
                const count = events.filter((e) => e.sourceId === s.id).length
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                        {s.name}
                        <Badge><Lock className="h-3 w-3" /> Read-only</Badge>
                        {s.lastError ? <Badge tone="bad">Error</Badge> : s.lastSyncAt ? <Badge tone="good">OK</Badge> : null}
                      </p>
                      <p className="text-xs text-muted">
                        {count} events · last successful sync {ago(s.lastSyncAt)}
                        {s.lastAttemptAt && s.lastAttemptAt !== s.lastSyncAt ? ` · last attempt ${ago(s.lastAttemptAt)}` : ''}
                        {s.lastResult ? ` · +${s.lastResult.added} ~${s.lastResult.updated} −${s.lastResult.removed}` : ''}
                      </p>
                      {s.lastError && <p className={cn('mt-1 text-xs text-bad-fg')}>{s.lastError}</p>}
                    </div>
                    <Select value={String(s.autoRefreshMinutes)} onChange={(e) => updateSource(s.id, { autoRefreshMinutes: Number(e.target.value) }).catch(toast.error)} className="w-auto" aria-label="Auto refresh">
                      <option value="0">Manual</option>
                      <option value="30">30 min</option>
                      <option value="60">Hourly</option>
                      <option value="360">6 h</option>
                    </Select>
                    <Button size="sm" icon={syncing === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} disabled={!proxy || syncing === s.id} onClick={() => sync(s)}>
                      Refresh now
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove subscription"
                      onClick={async () => {
                        if (await confirm({ title: `Unsubscribe from “${s.name}”?`, message: `Its ${count} mirrored events will be removed from Personal HQ. Nothing changes in Apple Calendar.`, confirmLabel: 'Unsubscribe', danger: true })) deleteSource(s.id, true).then(() => toast.success('Unsubscribed')).catch(toast.error)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Info className="h-3.5 w-3.5" /> Reference: Apple's guide to public calendars —{' '}
        <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href="https://support.apple.com/guide/calendar/share-calendars-icl1009a/mac" target="_blank" rel="noopener noreferrer">
          support.apple.com <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  )
}
