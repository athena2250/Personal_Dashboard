import { useState } from 'react'
import { Plus, Trash2, Clock } from 'lucide-react'
import type { Milestone, Tracker, TrackerRecord } from '@/data/models'
import { addRecord, deleteRecord, updateRecord } from '@/data/repos/trackers'
import { useSessions } from '@/data/hooks'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/ui/forms'
import { FieldInput, validateFields } from '@/components/FieldInput'
import { useSubmit } from '@/components/useSubmit'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { uid } from '@/lib/util'
import { formatMinutes } from '@/lib/dates'

export function RecordFormModal({ open, onClose, tracker, record, preset }: { open: boolean; onClose: () => void; tracker: Tracker; record?: TrackerRecord; preset?: Partial<TrackerRecord> }) {
  const label = tracker.recordLabel || 'Item'
  return (
    <Modal open={open} onClose={onClose} title={record ? `Edit ${label.toLowerCase()}` : `New ${label.toLowerCase()}`} size="lg">
      {open && <RecordForm tracker={tracker} record={record} preset={preset} onDone={onClose} />}
    </Modal>
  )
}

function RecordForm({ tracker, record, preset, onDone }: { tracker: Tracker; record?: TrackerRecord; preset?: Partial<TrackerRecord>; onDone: () => void }) {
  const init = record ?? preset
  const [title, setTitle] = useState(init?.title ?? '')
  const [status, setStatus] = useState(init?.status ?? tracker.statuses[0]?.id ?? '')
  const [category, setCategory] = useState(init?.category ?? '')
  const [progress, setProgress] = useState<number | undefined>(init?.progress)
  const [deadline, setDeadline] = useState(init?.deadline ?? '')
  const [notes, setNotes] = useState(init?.notes ?? '')
  const [values, setValues] = useState<Record<string, unknown>>(init?.values ?? {})
  const [milestones, setMilestones] = useState<Milestone[]>(init?.milestones ?? [])
  const [newMs, setNewMs] = useState('')
  const { busy, errors, setErrors, run } = useSubmit()
  const confirm = useConfirm()
  const toast = useToast()
  const sessions = useSessions(tracker.id)
  const linkedMinutes = record ? (sessions ?? []).filter((s) => s.recordId === record.id).reduce((s, x) => s + x.minutes, 0) : 0
  const label = tracker.recordLabel || 'Item'

  const doneStatus = tracker.statuses.find((s) => s.done)
  const msDone = milestones.filter((m) => m.done).length

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fieldErrors = validateFields(tracker.fields, values)
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors)
      return
    }
    const cleanValues = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''))
    const data = {
      title,
      status: status || undefined,
      category: category || undefined,
      progress,
      deadline: deadline || undefined,
      notes: notes || undefined,
      values: cleanValues,
      milestones,
    }
    const ok = await run(() => (record ? updateRecord(record.id, data) : addRecord({ ...data, trackerId: tracker.id, kind: preset?.kind ?? 'item' })), record ? `${label} updated` : `${label} added`)
    if (ok) onDone()
  }

  const remove = async () => {
    if (!record) return
    if (!(await confirm({ title: `Delete ${label.toLowerCase()}?`, message: `"${record.title}" will be permanently deleted. Logged sessions are kept but unlinked.`, confirmLabel: 'Delete', danger: true }))) return
    try {
      await deleteRecord(record.id)
      toast.success(`${label} deleted`)
      onDone()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {record && linkedMinutes > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" /> {formatMinutes(linkedMinutes)} logged against this {label.toLowerCase()}
        </p>
      )}
      <LabeledInput label="Title" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LabeledSelect
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            if (doneStatus && e.target.value === doneStatus.id && progress != null && progress < 100) setProgress(100)
          }}
        >
          {tracker.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </LabeledSelect>
        {tracker.categories.length > 0 && (
          <LabeledSelect label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {[...new Set([...tracker.categories, ...(category ? [category] : [])])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </LabeledSelect>
        )}
        <LabeledInput label="Deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} error={errors.deadline} />
      </div>
      <Field label={`Progress${progress != null ? `: ${progress}%` : ''}`} hint={milestones.length ? `Milestones: ${msDone}/${milestones.length} done` : undefined}>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={100} step={5} value={progress ?? 0} onChange={(e) => setProgress(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" aria-label="Progress percent" />
          {milestones.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setProgress(Math.round((msDone / milestones.length) * 100))}>
              From milestones
            </Button>
          )}
          {progress != null && (
            <Button size="sm" variant="ghost" onClick={() => setProgress(undefined)}>
              Clear
            </Button>
          )}
        </div>
      </Field>
      {tracker.fields.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tracker.fields.map((f) => (
            <FieldInput key={f.id} field={f} value={values[f.id]} error={errors[`values.${f.id}`]} onChange={(v) => setValues((x) => ({ ...x, [f.id]: v }))} />
          ))}
        </div>
      )}
      <Field label="Milestones">
        <div className="space-y-1.5">
          {milestones.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2">
              <Checkbox label={<span className="sr-only">Done</span>} checked={m.done} onChange={(v) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, done: v } : x)))} />
              <Input value={m.title} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className={m.done ? 'text-muted line-through' : ''} aria-label="Milestone title" />
              <Input type="date" value={m.due ?? ''} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, due: e.target.value || undefined } : x)))} className="w-40" aria-label="Milestone due date" />
              <Button variant="ghost" size="icon" aria-label="Remove milestone" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={newMs}
              onChange={(e) => setNewMs(e.target.value)}
              placeholder="Add a milestone…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (newMs.trim()) {
                    setMilestones([...milestones, { id: uid(), title: newMs.trim(), done: false }])
                    setNewMs('')
                  }
                }
              }}
            />
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                if (newMs.trim()) {
                  setMilestones([...milestones, { id: uid(), title: newMs.trim(), done: false }])
                  setNewMs('')
                }
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </Field>
      <LabeledTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex items-center justify-between gap-2">
        {record ? (
          <Button variant="ghost" className="text-bad-fg" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {record ? 'Save' : 'Add'}
          </Button>
        </div>
      </div>
    </form>
  )
}
