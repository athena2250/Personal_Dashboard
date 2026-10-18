import { useMemo, useState } from 'react'
import type { LearningSession } from '@/data/models'
import { addSession, updateSession } from '@/data/repos/trackers'
import { useRecords, useTrackers } from '@/data/hooks'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/ui/forms'
import { FieldInput } from '@/components/FieldInput'
import { useSubmit } from '@/components/useSubmit'
import { useApp } from '@/app/AppContext'
import { TrackerIcon } from '@/components/ui/Icon'

export function SessionFormModal({ open, onClose, session, trackerId, recordId }: { open: boolean; onClose: () => void; session?: LearningSession; trackerId?: string; recordId?: string }) {
  return (
    <Modal open={open} onClose={onClose} title={session ? 'Edit session' : 'Log a session'} description={session ? undefined : 'Every session updates streaks, heatmaps and Learning Hub stats.'} size="md">
      {open && <SessionForm session={session} trackerId={trackerId} recordId={recordId} onDone={onClose} />}
    </Modal>
  )
}

const QUICK_MINUTES = [15, 30, 45, 60, 90, 120]

function SessionForm({ session, trackerId: presetTracker, recordId: presetRecord, onDone }: { session?: LearningSession; trackerId?: string; recordId?: string; onDone: () => void }) {
  const { today } = useApp()
  const trackers = useTrackers()
  const [trackerId, setTrackerId] = useState(session?.trackerId ?? presetTracker ?? '')
  const tracker = trackers?.find((t) => t.id === (trackerId || trackers?.[0]?.id))
  const effectiveTrackerId = tracker?.id ?? ''
  const records = useRecords(effectiveTrackerId || undefined, 'item')
  const [date, setDate] = useState(session?.date ?? today)
  const [minutes, setMinutes] = useState(String(session?.minutes ?? 30))
  const [title, setTitle] = useState(session?.title ?? '')
  const [count, setCount] = useState(session?.count != null ? String(session.count) : '')
  const [notes, setNotes] = useState(session?.notes ?? '')
  const [recordId, setRecordId] = useState(session?.recordId ?? presetRecord ?? '')
  const [attrs, setAttrs] = useState<Record<string, unknown>>(session?.attrs ?? {})
  const { busy, errors, run } = useSubmit()

  const activeRecords = useMemo(() => {
    if (!records || !tracker) return []
    const done = new Set(tracker.statuses.filter((s) => s.done).map((s) => s.id))
    return records.filter((r) => !done.has(r.status ?? '') || r.id === recordId)
  }, [records, tracker, recordId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanAttrs = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined && v !== '')) as LearningSession['attrs']
    const data = {
      trackerId: effectiveTrackerId,
      date,
      minutes: minutes === '' ? 0 : Math.round(Number(minutes)),
      title: title.trim() || `${tracker?.name ?? 'Learning'} session`,
      count: count === '' ? undefined : Math.round(Number(count)),
      notes: notes || undefined,
      recordId: recordId || undefined,
      attrs: cleanAttrs,
    }
    const ok = await run(() => (session ? updateSession(session.id, data) : addSession(data)), session ? 'Session updated' : `Logged ${data.minutes} min to ${tracker?.name}`)
    if (ok) onDone()
  }

  if (trackers && !trackers.length) return <p className="text-sm text-muted">Create a tracker first.</p>

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Tracker" required>
        <div className="flex flex-wrap gap-2">
          {trackers?.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => {
                setTrackerId(t.id)
                setAttrs({})
                setRecordId('')
              }}
              aria-pressed={t.id === effectiveTrackerId}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${t.id === effectiveTrackerId ? 'border-[var(--accent)] bg-accent-soft text-fg' : 'border-line text-fg-2 hover:border-line-strong'}`}
            >
              <TrackerIcon name={t.icon} color={t.color} size="sm" />
              {t.name}
            </button>
          ))}
        </div>
      </Field>
      <LabeledInput label="What did you work on?" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder={`${tracker?.name ?? ''} session`} autoFocus />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabeledInput label="Date" type="date" required value={date} max={today} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <Field label="Minutes" required error={errors.minutes}>
          <Input type="number" min={0} max={1440} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-invalid={!!errors.minutes} />
          <div className="mt-1 flex flex-wrap gap-1">
            {QUICK_MINUTES.map((m) => (
              <button type="button" key={m} onClick={() => setMinutes(String(m))} className={`rounded-md px-1.5 py-0.5 text-[11px] ${String(m) === minutes ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'}`}>
                {m >= 60 ? `${m / 60}h` : `${m}m`}
              </button>
            ))}
          </div>
        </Field>
      </div>
      {tracker && (tracker.countLabel || tracker.sessionFields.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tracker.countLabel && <LabeledInput label={tracker.countLabel} type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} error={errors.count} />}
          {tracker.sessionFields.map((f) => (
            <FieldInput key={f.id} field={f} value={attrs[f.id]} onChange={(v) => setAttrs((a) => ({ ...a, [f.id]: v as string }))} />
          ))}
        </div>
      )}
      {activeRecords.length > 0 && (
        <LabeledSelect label={`Link to ${tracker?.recordLabel.toLowerCase() || 'record'} (optional)`} value={recordId} onChange={(e) => setRecordId(e.target.value)} hint="Time logged here also counts toward that item.">
          <option value="">None</option>
          {activeRecords.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </LabeledSelect>
      )}
      <LabeledTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you learn? What's next?" />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!effectiveTrackerId}>
          {session ? 'Save' : 'Log session'}
        </Button>
      </div>
    </form>
  )
}
