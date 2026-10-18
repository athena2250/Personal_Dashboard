import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowDown, ArrowUp, BookOpen, Dumbbell, Award, Lightbulb, Plus, Trash2, Wand2 } from 'lucide-react'
import type { FieldDef, FieldType, StatusDef, Tracker, TrackerSection, TrackerView } from '@/data/models'
import { createTracker, updateTracker } from '@/data/repos/trackers'
import { useTracker } from '@/data/hooks'
import { COLOR_CHOICES, ICON_CHOICES } from '@/data/defaults'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, Loading, PageHeader, Segmented } from '@/components/ui/display'
import { Checkbox, Field, Input, LabeledInput, LabeledSelect, LabeledTextarea, Select } from '@/components/ui/forms'
import { TrackerIcon, ICONS } from '@/components/ui/Icon'
import { useSubmit } from '@/components/useSubmit'
import { uid, cn } from '@/lib/util'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Dropdown' },
  { value: 'url', label: 'URL' },
]

type Draft = Pick<Tracker, 'name' | 'description' | 'icon' | 'color' | 'section' | 'fields' | 'sessionFields' | 'statuses' | 'categories' | 'view' | 'countLabel' | 'recordLabel' | 'goals'>

const f = (name: string, type: FieldType, options?: string[]): FieldDef => ({ id: '', name, type, options, showInTable: true })
const st = (name: string, color: string, done = false): StatusDef => ({ id: '', name, color, done })

const PRESETS: { key: string; label: string; icon: typeof BookOpen; draft: Partial<Draft> }[] = [
  {
    key: 'books',
    label: 'Books',
    icon: BookOpen,
    draft: {
      name: 'Books',
      description: 'Books I am reading and want to read.',
      icon: 'BookOpen',
      color: '#f97316',
      recordLabel: 'Book',
      countLabel: 'Pages read',
      view: 'cards',
      fields: [f('Author', 'text'), f('Genre', 'select', ['Fiction', 'Non-fiction', 'Technical', 'Biography']), f('Pages', 'number'), f('Rating', 'select', ['★', '★★', '★★★', '★★★★', '★★★★★']), f('Link', 'url')],
      statuses: [st('Want to read', '#64748b'), st('Reading', '#3b82f6'), st('Finished', '#22c55e', true), st('Abandoned', '#ef4444')],
      goals: [{ id: uid(), title: 'Read 20 minutes a day', metric: 'minutes', period: 'day', target: 20 }],
    },
  },
  {
    key: 'fitness',
    label: 'Fitness',
    icon: Dumbbell,
    draft: {
      name: 'Fitness',
      description: 'Workouts and training.',
      icon: 'Dumbbell',
      color: '#22c55e',
      section: 'personal',
      recordLabel: 'Routine',
      countLabel: '',
      view: 'table',
      sessionFields: [f('Workout type', 'select', ['Strength', 'Cardio', 'Yoga', 'Sport', 'Walk']), f('Intensity', 'select', ['Light', 'Moderate', 'Hard'])],
      fields: [f('Focus', 'text'), f('Notes', 'longtext')],
      statuses: [st('Active', '#22c55e'), st('Paused', '#f59e0b'), st('Retired', '#64748b', true)],
      goals: [{ id: uid(), title: 'Work out 4 times a week', metric: 'sessions', period: 'week', target: 4 }],
    },
  },
  {
    key: 'certs',
    label: 'Certifications',
    icon: Award,
    draft: {
      name: 'Certifications',
      description: 'Certifications to earn, with exam dates and costs.',
      icon: 'Award',
      color: '#eab308',
      recordLabel: 'Certification',
      view: 'table',
      fields: [f('Provider', 'text'), f('Exam date', 'date'), f('Cost', 'currency'), f('Credential URL', 'url'), f('Voucher bought', 'checkbox')],
      statuses: [st('Planned', '#64748b'), st('Studying', '#3b82f6'), st('Scheduled', '#8b5cf6'), st('Certified', '#22c55e', true)],
    },
  },
  {
    key: 'side',
    label: 'Side projects',
    icon: Lightbulb,
    draft: {
      name: 'Side projects',
      description: 'Ideas and experiments outside of work.',
      icon: 'Lightbulb',
      color: '#ec4899',
      section: 'personal',
      recordLabel: 'Project',
      view: 'cards',
      fields: [f('Repo', 'url'), f('Stack', 'text'), f('Next step', 'text')],
      statuses: [st('Idea', '#64748b'), st('Building', '#3b82f6'), st('Shipped', '#22c55e', true), st('Dropped', '#ef4444')],
      categories: ['Tool', 'App', 'Experiment'],
    },
  },
]

function emptyDraft(section: TrackerSection): Draft {
  return {
    name: '',
    description: '',
    icon: 'Target',
    color: '#8b5cf6',
    section,
    fields: [],
    sessionFields: [],
    statuses: [st('To do', '#64748b'), st('In progress', '#3b82f6'), st('Done', '#22c55e', true)],
    categories: [],
    view: 'table',
    countLabel: '',
    recordLabel: 'Item',
    goals: [],
  }
}

export function TrackerBuilderPage() {
  const { id } = useParams()
  const existing = useTracker(id)
  if (id && existing === undefined) return <Loading />
  return <Builder key={existing?.id ?? 'new'} existing={existing ?? undefined} />
}

function FieldsEditor({ fields, onChange, title, hint }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void; title: string; hint: string }) {
  const set = (i: number, patch: Partial<FieldDef>) => onChange(fields.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= fields.length) return
    const next = [...fields]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <Card>
      <CardHeader title={title} subtitle={hint} action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...fields, { id: '', name: '', type: 'text', showInTable: true }])}>Add field</Button>} />
      <CardBody className="space-y-3">
        {fields.length === 0 && <p className="text-xs text-muted">No custom fields yet.</p>}
        {fields.map((fd, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
              <Input value={fd.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Field name" aria-label="Field name" />
              <Select value={fd.type} onChange={(e) => set(i, { type: e.target.value as FieldType })} aria-label="Field type" disabled={!!fd.id}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <div className="flex">
                <Button size="icon" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Remove field" onClick={() => onChange(fields.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {fd.type === 'select' && (
              <Input className="mt-2" value={(fd.options ?? []).join(', ')} onChange={(e) => set(i, { options: e.target.value.split(',').map((s) => s.trimStart()) })} placeholder="Options, comma separated" aria-label="Dropdown options" />
            )}
            <div className="mt-2 flex flex-wrap gap-4">
              <Checkbox label="Required" checked={!!fd.required} onChange={(v) => set(i, { required: v })} />
              <Checkbox label="Show in table" checked={fd.showInTable !== false} onChange={(v) => set(i, { showInTable: v })} />
            </div>
            {fd.id && <p className="mt-1 text-[11px] text-muted">Type is locked for existing fields so saved values stay valid.</p>}
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

function Builder({ existing }: { existing?: Tracker }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [d, setD] = useState<Draft>(() => (existing ? { ...existing } : emptyDraft((params.get('section') as TrackerSection) || 'learning')))
  const [catText, setCatText] = useState(d.categories.join(', '))
  const { busy, errors, setErrors, run } = useSubmit()
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const fields = d.fields.map((x) => ({ ...x, options: x.options?.map((o) => o.trim()).filter(Boolean) }))
    const emptyField = [...fields, ...d.sessionFields].find((x) => !x.name.trim())
    if (emptyField) return setErrors({ fields: 'Every field needs a name' })
    const badSelect = [...fields, ...d.sessionFields].find((x) => x.type === 'select' && !(x.options ?? []).filter((o) => o.trim()).length)
    if (badSelect) return setErrors({ fields: `Add at least one option to “${badSelect.name}”` })
    if (!d.statuses.some((s) => s.done)) return setErrors({ statuses: 'Mark at least one status as “done” so progress can be measured' })
    const data = {
      ...d,
      fields,
      sessionFields: d.sessionFields.map((x) => ({ ...x, options: x.options?.map((o) => o.trim()).filter(Boolean) })),
      categories: catText.split(',').map((c) => c.trim()).filter(Boolean),
    }
    let newId = existing?.id
    const ok = await run(async () => {
      if (existing) await updateTracker(existing.id, data)
      else newId = (await createTracker({ ...data, template: 'custom', config: {} })).id
    }, existing ? 'Tracker saved' : `${d.name} created`)
    if (ok) navigate(`/trackers/${newId}`)
  }

  return (
    <form onSubmit={save} className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow={existing ? 'Customize tracker' : 'Create tracker'}
        title={d.name || (existing ? existing.name : 'New tracker')}
        subtitle="Design your own tracker: fields, statuses, goals and how it's displayed."
        icon={<TrackerIcon name={d.icon} color={d.color} size="lg" />}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {existing ? 'Save changes' : 'Create tracker'}
            </Button>
          </>
        }
      />
      {!existing && (
        <Card>
          <CardHeader title="Start from a template" subtitle="Optional — every part stays editable" icon={<Wand2 className="h-4 w-4 text-accent" />} />
          <CardBody className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                icon={<p.icon className="h-4 w-4" />}
                onClick={() => {
                  const next = { ...emptyDraft(d.section), ...p.draft, fields: (p.draft.fields ?? []).map((x) => ({ ...x })), goals: (p.draft.goals ?? []).map((g) => ({ ...g, id: uid() })) }
                  setD(next)
                  setCatText((next.categories ?? []).join(', '))
                }}
              >
                {p.label}
              </Button>
            ))}
          </CardBody>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Basics" />
          <CardBody className="space-y-4">
            <LabeledInput label="Name" required value={d.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} placeholder="e.g. Books, Fitness, AWS certifications" />
            <LabeledTextarea label="Description" value={d.description} onChange={(e) => set({ description: e.target.value })} className="[&_textarea]:min-h-[60px]" />
            <Field label="Where does it live?">
              <Segmented
                value={d.section}
                onChange={(v) => set({ section: v })}
                options={[
                  { value: 'learning', label: 'Learning Hub' },
                  { value: 'personal', label: 'Collections' },
                ]}
              />
            </Field>
            <p className="-mt-2 text-xs text-muted">Learning Hub trackers count toward your unified learning streak and stats.</p>
            <Field label="Icon">
              <div className="flex flex-wrap gap-1.5">
                {ICON_CHOICES.filter((n) => ICONS[n]).map((n) => (
                  <button type="button" key={n} onClick={() => set({ icon: n })} aria-label={n} aria-pressed={d.icon === n} className={cn('rounded-xl p-0.5', d.icon === n && 'ring-2 ring-[var(--accent)]')}>
                    <TrackerIcon name={n} color={d.color} size="sm" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Color">
              <div className="flex flex-wrap gap-2">
                {COLOR_CHOICES.map((c) => (
                  <button type="button" key={c} onClick={() => set({ color: c })} aria-label={`Color ${c}`} aria-pressed={d.color === c} className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-[var(--surface)]', d.color === c && 'ring-2 ring-fg')} style={{ background: c }} />
                ))}
              </div>
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Records & display" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Record name (singular)" value={d.recordLabel} onChange={(e) => set({ recordLabel: e.target.value })} placeholder="Book, Course, Project…" />
              <LabeledSelect label="Default view" value={d.view} onChange={(e) => set({ view: e.target.value as TrackerView })}>
                <option value="table">Table</option>
                <option value="cards">Cards</option>
                <option value="calendar">Calendar</option>
              </LabeledSelect>
            </div>
            <LabeledInput label="Session counter label (optional)" value={d.countLabel} onChange={(e) => set({ countLabel: e.target.value })} placeholder="e.g. Pages read, Problems solved, Reps" hint="Adds a numeric counter to each logged session. Leave empty to hide." />
            <LabeledInput label="Categories (optional)" value={catText} onChange={(e) => setCatText(e.target.value)} placeholder="Comma separated" />
            <Field label="Statuses" error={errors.statuses} hint="Statuses marked done count as completed in goals and progress.">
              <div className="space-y-2">
                {d.statuses.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="color" value={s.color} onChange={(e) => set({ statuses: d.statuses.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-transparent" aria-label="Status color" />
                    <Input value={s.name} onChange={(e) => set({ statuses: d.statuses.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Status name" />
                    <Checkbox label="Done" checked={!!s.done} onChange={(v) => set({ statuses: d.statuses.map((x, j) => (j === i ? { ...x, done: v } : x)) })} />
                    <Button size="icon" variant="ghost" aria-label="Remove status" disabled={d.statuses.length <= 1} onClick={() => set({ statuses: d.statuses.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set({ statuses: [...d.statuses, st('', '#64748b')] })}>
                  Add status
                </Button>
              </div>
            </Field>
          </CardBody>
        </Card>
      </div>
      {errors.fields && <p className="rounded-xl bg-bad/10 px-4 py-2 text-sm text-bad-fg" role="alert">{errors.fields}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <FieldsEditor title="Record fields" hint="Custom columns for each record (e.g. Author, Exam date, Cost)." fields={d.fields} onChange={(fields) => set({ fields })} />
        <FieldsEditor title="Session fields" hint="Extra details captured each time you log a session." fields={d.sessionFields} onChange={(sessionFields) => set({ sessionFields })} />
      </div>
      <p className="text-xs text-muted">Goals can be added from the tracker's Goals tab after saving.</p>
    </form>
  )
}
