import { useState } from 'react'
import type { CalendarEvent } from '@/data/models'
import { addEvent, updateEvent } from '@/data/repos/events'
import { useRecords, useTrackers } from '@/data/hooks'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, LabeledInput, LabeledSelect, LabeledTextarea, Toggle } from '@/components/ui/forms'
import { useSubmit } from '@/components/useSubmit'
import { useApp } from '@/app/AppContext'
import { getAppTimezone, zonedParts, zonedToUtc } from '@/lib/tz'
import { buildRRule, simpleRepeatOf, type SimpleRepeat } from '@/domain/rrule'

export const REMINDER_CHOICES = [
  { v: 0, label: 'At start' },
  { v: 5, label: '5 min' },
  { v: 15, label: '15 min' },
  { v: 30, label: '30 min' },
  { v: 60, label: '1 hour' },
  { v: 1440, label: '1 day' },
  { v: 10080, label: '1 week' },
]

export function EventFormModal({ open, onClose, event, presetDate, presetTime }: { open: boolean; onClose: () => void; event?: CalendarEvent; presetDate?: string; presetTime?: string }) {
  return (
    <Modal open={open} onClose={onClose} title={event ? 'Edit event' : 'New event'} size="md">
      {open && <EventForm event={event} presetDate={presetDate} presetTime={presetTime} onDone={onClose} />}
    </Modal>
  )
}

function addHour(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function EventForm({ event, presetDate, presetTime, onDone }: { event?: CalendarEvent; presetDate?: string; presetTime?: string; onDone: () => void }) {
  const { today, settings } = useApp()
  const tz = getAppTimezone()
  const trackers = useTrackers()
  const startParts = event && !event.allDay ? zonedParts(event.start, tz) : null
  const endParts = event && !event.allDay ? zonedParts(event.end, tz) : null
  const [title, setTitle] = useState(event?.title ?? '')
  const [allDay, setAllDay] = useState(event?.allDay ?? !presetTime)
  const [startDate, setStartDate] = useState(event ? (event.allDay ? event.start : startParts!.date) : presetDate ?? today)
  const [startTime, setStartTime] = useState(startParts?.time ?? presetTime ?? '09:00')
  const [endDate, setEndDate] = useState(event ? (event.allDay ? event.end : endParts!.date) : presetDate ?? today)
  const [endTime, setEndTime] = useState(endParts?.time ?? addHour(presetTime ?? '09:00'))
  const [category, setCategory] = useState(event?.category ?? settings.eventCategories[0]?.id ?? 'personal')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [repeat, setRepeat] = useState<SimpleRepeat>(simpleRepeatOf(event?.rrule))
  const [until, setUntil] = useState('')
  const customRule = !!event?.rrule && simpleRepeatOf(event.rrule) === 'none'
  const [reminders, setReminders] = useState<number[]>(event?.reminders ?? [])
  const [linkedTrackerId, setLinkedTrackerId] = useState(event?.linkedTrackerId ?? '')
  const [linkedRecordId, setLinkedRecordId] = useState(event?.linkedRecordId ?? '')
  const records = useRecords(linkedTrackerId || undefined, 'item')
  const { busy, errors, run } = useSubmit()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const start = allDay ? startDate : zonedToUtc(startDate, startTime, tz)
    const end = allDay ? (endDate < startDate ? startDate : endDate) : zonedToUtc(endDate, endTime, tz)
    const data = {
      title,
      allDay,
      start,
      end,
      timezone: allDay ? undefined : tz,
      category,
      location: location || undefined,
      description: description || undefined,
      rrule: customRule && repeat === 'none' ? event!.rrule : buildRRule(repeat, { until: until || undefined }),
      reminders,
      linkedTrackerId: linkedTrackerId || undefined,
      linkedRecordId: linkedRecordId || undefined,
      readOnly: false,
    }
    const ok = await run(() => (event ? updateEvent(event.id, data) : addEvent(data)), event ? 'Event updated' : 'Event created')
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <LabeledInput label="Title" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="e.g. PyCon talk, GRE exam, project demo" />
      <Toggle label="All-day" checked={allDay} onChange={setAllDay} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LabeledInput
          label="Starts"
          type="date"
          required
          value={startDate}
          onChange={(e) => {
            const v = e.target.value
            if (endDate < v || endDate === startDate) setEndDate(v)
            setStartDate(v)
          }}
          className={allDay ? 'col-span-2' : ''}
        />
        {!allDay && (
          <LabeledInput
            label="Time"
            type="time"
            required
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value)
              if (endDate === startDate && endTime <= e.target.value) setEndTime(addHour(e.target.value))
            }}
          />
        )}
        <LabeledInput label="Ends" type="date" required value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={allDay ? 'col-span-2' : ''} error={errors.end} />
        {!allDay && <LabeledInput label="Time" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
      </div>
      {!allDay && <p className="-mt-2 text-xs text-muted">Times are in {tz}. Change your timezone in Settings.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabeledSelect label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {settings.eventCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="Repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as SimpleRepeat)} hint={customRule && repeat === 'none' ? `Keeps imported rule: ${event?.rrule}` : undefined}>
          <option value="none">{customRule ? 'Custom (from import)' : 'Does not repeat'}</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </LabeledSelect>
        {repeat !== 'none' && <LabeledInput label="Repeat until (optional)" type="date" min={startDate} value={until} onChange={(e) => setUntil(e.target.value)} />}
        <LabeledInput label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <Field label="Reminders" hint="Shown as browser notifications while Personal HQ is open (enable in Settings). Exported to Apple Calendar as alerts.">
        <div className="flex flex-wrap gap-1.5">
          {REMINDER_CHOICES.map((r) => {
            const on = reminders.includes(r.v)
            return (
              <button
                type="button"
                key={r.v}
                aria-pressed={on}
                onClick={() => setReminders(on ? reminders.filter((x) => x !== r.v) : [...reminders, r.v].sort((a, b) => a - b))}
                className={`rounded-lg border px-2 py-1 text-xs ${on ? 'border-[var(--events)] bg-events-soft text-fg' : 'border-line text-fg-2 hover:border-line-strong'}`}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabeledSelect
          label="Link to learning goal / project"
          value={linkedTrackerId}
          onChange={(e) => {
            setLinkedTrackerId(e.target.value)
            setLinkedRecordId('')
          }}
        >
          <option value="">None</option>
          {trackers?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </LabeledSelect>
        {linkedTrackerId && (records?.length ?? 0) > 0 && (
          <LabeledSelect label="Item" value={linkedRecordId} onChange={(e) => setLinkedRecordId(e.target.value)}>
            <option value="">Whole tracker</option>
            {records?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </LabeledSelect>
        )}
      </div>
      <LabeledTextarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {event ? 'Save' : 'Create event'}
        </Button>
      </div>
    </form>
  )
}

