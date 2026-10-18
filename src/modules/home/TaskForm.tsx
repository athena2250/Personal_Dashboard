import { useState } from 'react'
import type { Task } from '@/data/models'
import { addTask, updateTask } from '@/data/repos/tasks'
import { useTrackers } from '@/data/hooks'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/ui/forms'
import { useSubmit } from '@/components/useSubmit'
import { useApp } from '@/app/AppContext'

export function TaskFormModal({ open, onClose, task, preset }: { open: boolean; onClose: () => void; task?: Task; preset?: Partial<Task> }) {
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} size="sm">
      {open && <TaskForm task={task} preset={preset} onDone={onClose} />}
    </Modal>
  )
}

function TaskForm({ task, preset, onDone }: { task?: Task; preset?: Partial<Task>; onDone: () => void }) {
  const { today } = useApp()
  const trackers = useTrackers()
  const init = task ?? preset
  const [title, setTitle] = useState(init?.title ?? '')
  const [dueDate, setDueDate] = useState(init?.dueDate ?? (task ? '' : today))
  const [priority, setPriority] = useState<Task['priority']>(init?.priority ?? 'medium')
  const [trackerId, setTrackerId] = useState(init?.trackerId ?? '')
  const [notes, setNotes] = useState(init?.notes ?? '')
  const { busy, errors, run } = useSubmit()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = { title, dueDate: dueDate || undefined, priority, trackerId: trackerId || undefined, notes: notes || undefined }
    if (await run(() => (task ? updateTask(task.id, data) : addTask(data)), task ? 'Task updated' : 'Task added')) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <LabeledInput label="Title" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="What needs doing?" />
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} />
        <LabeledSelect label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </LabeledSelect>
      </div>
      <LabeledSelect label="Link to tracker (optional)" value={trackerId} onChange={(e) => setTrackerId(e.target.value)}>
        <option value="">None</option>
        {trackers?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </LabeledSelect>
      <LabeledTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {task ? 'Save' : 'Add task'}
        </Button>
      </div>
    </form>
  )
}
