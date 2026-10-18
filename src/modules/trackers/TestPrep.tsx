import { useMemo, useState } from 'react'
import { BookA, CalendarClock, Check, Pencil, Plus, RotateCcw, Search, Settings2, Target, Trash2, Trophy } from 'lucide-react'
import type { LearningSession, Task, Tracker, TrackerRecord } from '@/data/models'
import { addRecord, deleteRecord, updateRecord, updateTracker } from '@/data/repos/trackers'
import { useTasks } from '@/data/hooks'
import { DEFAULT_TESTPREP_CONFIG, type TestPrepConfig } from '@/data/defaults'
import { breakdownByAttr } from '@/domain/activity'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, StatCard } from '@/components/ui/display'
import { Input, LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/ui/forms'
import { Modal } from '@/components/ui/Modal'
import { TrendChart, BarsChart } from '@/components/charts/Charts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useSubmit } from '@/components/useSubmit'
import { useApp } from '@/app/AppContext'
import { addDays, diffDays, formatDate, formatHours, relativeDays } from '@/lib/dates'
import { cn } from '@/lib/util'
import { TaskFormModal } from '@/modules/home/TaskForm'

export function getConfig(t: Tracker): TestPrepConfig {
  const c = t.config as Partial<TestPrepConfig>
  return {
    targets: { GRE: { ...DEFAULT_TESTPREP_CONFIG.targets.GRE, ...c.targets?.GRE }, TOEFL: { ...DEFAULT_TESTPREP_CONFIG.targets.TOEFL, ...c.targets?.TOEFL } },
    testDates: { ...c.testDates },
  }
}

type Exam = 'GRE' | 'TOEFL'
const SECTIONS: Record<Exam, { key: string; label: string; min: number; max: number; step: number }[]> = {
  GRE: [
    { key: 'verbal', label: 'Verbal', min: 130, max: 170, step: 1 },
    { key: 'quant', label: 'Quant', min: 130, max: 170, step: 1 },
    { key: 'awa', label: 'Analytical Writing', min: 0, max: 6, step: 0.5 },
  ],
  TOEFL: [
    { key: 'reading', label: 'Reading', min: 0, max: 30, step: 1 },
    { key: 'listening', label: 'Listening', min: 0, max: 30, step: 1 },
    { key: 'speaking', label: 'Speaking', min: 0, max: 30, step: 1 },
    { key: 'writing', label: 'Writing', min: 0, max: 30, step: 1 },
  ],
}

export function mockTotal(exam: Exam, v: Record<string, unknown>): number | null {
  const n = (k: string) => (typeof v[k] === 'number' ? (v[k] as number) : null)
  if (exam === 'GRE') {
    const a = n('verbal')
    const b = n('quant')
    return a != null && b != null ? a + b : null
  }
  const parts = ['reading', 'listening', 'speaking', 'writing'].map(n)
  return parts.every((p) => p != null) ? (parts as number[]).reduce((s, x) => s + x, 0) : null
}

function targetTotal(exam: Exam, cfg: TestPrepConfig) {
  return exam === 'GRE' ? cfg.targets.GRE.verbal + cfg.targets.GRE.quant : Object.values(cfg.targets.TOEFL).reduce((s, x) => s + x, 0)
}

/* ───────────── Overview panels ───────────── */

export function TestPrepOverview({ tracker, sessions, records }: { tracker: Tracker; sessions: LearningSession[]; records: TrackerRecord[] }) {
  const { today } = useApp()
  const t = useChartTheme()
  const cfg = getConfig(tracker)
  const [editCfg, setEditCfg] = useState(false)
  const mocks = records.filter((r) => r.kind === 'mock').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const latest = (exam: Exam) => [...mocks].reverse().find((m) => m.values.exam === exam)
  const sectionHours = breakdownByAttr(sessions, 'section').filter((d) => d.key !== 'Unspecified')
  const dueRevisions = records.filter((r) => r.kind === 'item' && typeof r.values?.revisionDate === 'string' && (r.values.revisionDate as string) <= addDays(today, 7) && r.status !== 'mastered').length
  const vocab = records.filter((r) => r.kind === 'vocab')

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['GRE', 'TOEFL'] as Exam[]).map((exam) => {
          const d = cfg.testDates[exam]
          return (
            <StatCard
              key={exam}
              label={`${exam} test date`}
              value={d ? (diffDays(d, today) >= 0 ? `${diffDays(d, today)} days` : 'Taken') : 'Not set'}
              sub={d ? formatDate(d) : <button className="text-accent hover:underline" onClick={() => setEditCfg(true)}>Set date & target</button>}
              icon={<CalendarClock className="h-4 w-4" />}
              tone="learning"
            />
          )
        })}
        <StatCard label="Revisions due (7 days)" value={dueRevisions} icon={<RotateCcw className="h-4 w-4" />} tone="warn" />
        <StatCard label="Vocabulary mastered" value={`${vocab.filter((v) => v.values.mastered).length}/${vocab.length}`} icon={<BookA className="h-4 w-4" />} tone="good" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['GRE', 'TOEFL'] as Exam[]).map((exam) => {
          const m = latest(exam)
          const total = m ? mockTotal(exam, m.values) : null
          const target = targetTotal(exam, cfg)
          return (
            <Card key={exam}>
              <CardHeader
                title={`${exam}: progress to target`}
                subtitle={m ? `Latest mock ${formatDate(m.date)}` : 'No mock tests yet'}
                icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-learning-soft text-learning"><Target className="h-4 w-4" /></span>}
                action={
                  <Button size="icon-sm" variant="ghost" aria-label="Edit targets" onClick={() => setEditCfg(true)}>
                    <Settings2 className="h-4 w-4" />
                  </Button>
                }
              />
              <CardBody>
                <div className="mb-4 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-fg">{total ?? '—'}</span>
                  <span className="text-sm text-muted">/ target {target}</span>
                  {total != null && <Badge tone={total >= target ? 'good' : 'warn'}>{total >= target ? 'On target' : `${target - total} to go`}</Badge>}
                </div>
                <ul className="space-y-3">
                  {SECTIONS[exam].map((s) => {
                    const val = m?.values[s.key] as number | undefined
                    const tgt = (cfg.targets[exam] as Record<string, number>)[s.key]
                    const pct = val != null ? (val - s.min) / (tgt - s.min || 1) : 0
                    return (
                      <li key={s.key}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-fg-2">{s.label}</span>
                          <span className="tabular text-muted">
                            {val ?? '—'} / {tgt}
                          </span>
                        </div>
                        <ProgressBar value={pct} color={val != null && val >= tgt ? 'var(--good)' : tracker.color} />
                      </li>
                    )
                  })}
                </ul>
              </CardBody>
            </Card>
          )
        })}
      </div>
      <Card>
        <CardHeader title="Study time by section" />
        <CardBody>
          {sectionHours.length ? (
            <BarsChart layout="vertical" height={Math.max(120, sectionHours.length * 32)} data={sectionHours.map((d) => ({ key: d.key, value: d.minutes }))} xKey="key" series={[{ key: 'value', label: 'Minutes', color: t.series[0] }]} yWidth={140} formatY={(v) => formatHours(v)} />
          ) : (
            <p className="py-6 text-center text-xs text-muted">Log sessions with a section (e.g. GRE Quant) to see this.</p>
          )}
        </CardBody>
      </Card>
      <TestConfigModal tracker={tracker} open={editCfg} onClose={() => setEditCfg(false)} />
    </>
  )
}

function TestConfigModal({ tracker, open, onClose }: { tracker: Tracker; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Targets & test dates" size="md">
      {open && <TestConfigForm tracker={tracker} onDone={onClose} />}
    </Modal>
  )
}

function TestConfigForm({ tracker, onDone }: { tracker: Tracker; onDone: () => void }) {
  const [cfg, setCfg] = useState(getConfig(tracker))
  const { busy, run } = useSubmit()
  const setTarget = (exam: Exam, key: string, v: string) => setCfg({ ...cfg, targets: { ...cfg.targets, [exam]: { ...cfg.targets[exam], [key]: Number(v) } } })
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => updateTracker(tracker.id, { config: cfg as unknown as Record<string, unknown> }), 'Targets saved')) onDone()
      }}
    >
      {(['GRE', 'TOEFL'] as Exam[]).map((exam) => (
        <fieldset key={exam} className="rounded-xl border border-line p-4">
          <legend className="px-1 text-xs font-semibold text-fg-2">{exam}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SECTIONS[exam].map((s) => (
              <LabeledInput key={s.key} label={`${s.label} target`} type="number" min={s.min} max={s.max} step={s.step} value={(cfg.targets[exam] as Record<string, number>)[s.key]} onChange={(e) => setTarget(exam, s.key, e.target.value)} />
            ))}
            <LabeledInput label="Planned test date" type="date" value={cfg.testDates[exam] ?? ''} onChange={(e) => setCfg({ ...cfg, testDates: { ...cfg.testDates, [exam]: e.target.value || undefined } })} />
          </div>
        </fieldset>
      ))}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  )
}

/* ───────────── Mock tests ───────────── */

export function MockTests({ tracker, records }: { tracker: Tracker; records: TrackerRecord[] }) {
  const t = useChartTheme()
  const confirm = useConfirm()
  const toast = useToast()
  const cfg = getConfig(tracker)
  const [exam, setExam] = useState<Exam>('GRE')
  const [editing, setEditing] = useState<TrackerRecord | null | undefined>(undefined)
  const mocks = records.filter((r) => r.kind === 'mock' && r.values.exam === exam).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const data = mocks.map((m) => ({ date: m.date ?? '', total: mockTotal(exam, m.values), ...Object.fromEntries(SECTIONS[exam].map((s) => [s.key, m.values[s.key] ?? null])) }))
  const sections = exam === 'GRE' ? SECTIONS.GRE.filter((s) => s.key !== 'awa') : SECTIONS.TOEFL

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5">
          {(['GRE', 'TOEFL'] as Exam[]).map((e) => (
            <button key={e} onClick={() => setExam(e)} className={cn('rounded-[10px] px-3 py-1.5 text-sm font-medium', exam === e ? 'bg-surface text-fg shadow-sm' : 'text-muted')} aria-pressed={exam === e}>
              {e}
            </button>
          ))}
        </div>
        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(null)}>
          Add mock test
        </Button>
      </div>
      <Card>
        <CardHeader title={`${exam} score trend`} subtitle={`Target total ${targetTotal(exam, cfg)}`} icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-learning-soft text-learning"><Trophy className="h-4 w-4" /></span>} />
        <CardBody>
          {mocks.length < 1 ? (
            <EmptyState compact title="No mock tests yet" description="Record mock tests to see your score trend against your target." />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <TrendChart data={data} xKey="date" area={false} height={220} formatX={(d) => formatDate(d, 'short')} series={[{ key: 'total', label: 'Total', color: t.series[0] }]} referenceY={{ value: targetTotal(exam, cfg), label: 'Target' }} yWidth={36} />
              <TrendChart data={data} xKey="date" area={false} height={220} showLegend formatX={(d) => formatDate(d, 'short')} series={sections.map((s, i) => ({ key: s.key, label: s.label, color: t.series[(i + 1) % 8] }))} yWidth={36} />
            </div>
          )}
        </CardBody>
      </Card>
      {mocks.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Test</th>
                  {SECTIONS[exam].map((s) => (
                    <th key={s.key} className="px-3 py-2.5 text-right font-medium">
                      {s.label}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...mocks].reverse().map((m) => (
                  <tr key={m.id} className="group">
                    <td className="px-4 py-2.5 text-fg-2">{formatDate(m.date)}</td>
                    <td className="px-3 py-2.5 text-fg">{m.title}</td>
                    {SECTIONS[exam].map((s) => (
                      <td key={s.key} className="tabular px-3 py-2.5 text-right text-fg-2">
                        {(m.values[s.key] as number | undefined) ?? '—'}
                      </td>
                    ))}
                    <td className="tabular px-3 py-2.5 text-right font-medium text-fg">{mockTotal(exam, m.values) ?? '—'}</td>
                    <td className="px-2 text-right">
                      <Button size="icon-sm" variant="ghost" aria-label="Edit mock test" onClick={() => setEditing(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete mock test"
                        onClick={async () => {
                          if (await confirm({ title: 'Delete mock test?', message: `"${m.title}" will be deleted.`, confirmLabel: 'Delete', danger: true })) deleteRecord(m.id).then(() => toast.success('Mock test deleted')).catch(toast.error)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Edit mock test' : `Add ${exam} mock test`} size="md">
        {editing !== undefined && <MockForm tracker={tracker} exam={(editing?.values.exam as Exam) ?? exam} mock={editing ?? undefined} onDone={() => setEditing(undefined)} />}
      </Modal>
    </div>
  )
}

function MockForm({ tracker, exam, mock, onDone }: { tracker: Tracker; exam: Exam; mock?: TrackerRecord; onDone: () => void }) {
  const { today } = useApp()
  const [title, setTitle] = useState(mock?.title ?? `${exam} mock`)
  const [date, setDate] = useState(mock?.date ?? today)
  const [scores, setScores] = useState<Record<string, string>>(Object.fromEntries(SECTIONS[exam].map((s) => [s.key, mock?.values[s.key] != null ? String(mock.values[s.key]) : ''])))
  const [notes, setNotes] = useState(mock?.notes ?? '')
  const { busy, errors, setErrors, run } = useSubmit()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const values: Record<string, unknown> = { exam }
    for (const s of SECTIONS[exam]) {
      if (scores[s.key] === '') continue
      const v = Number(scores[s.key])
      if (!(v >= s.min && v <= s.max)) errs[s.key] = `${s.min}–${s.max}`
      else values[s.key] = v
    }
    if (Object.keys(errs).length) return setErrors(errs)
    const data = { title, date, notes: notes || undefined, values }
    if (await run(() => (mock ? updateRecord(mock.id, data) : addRecord({ ...data, trackerId: tracker.id, kind: 'mock' })), 'Mock test saved')) onDone()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="Name / source" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <LabeledInput label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        {SECTIONS[exam].map((s) => (
          <LabeledInput key={s.key} label={`${s.label} (${s.min}–${s.max})`} type="number" min={s.min} max={s.max} step={s.step} value={scores[s.key]} onChange={(e) => setScores({ ...scores, [s.key]: e.target.value })} error={errors[s.key]} />
        ))}
      </div>
      <LabeledTextarea label="Notes / mistakes to review" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  )
}

/* ───────────── Vocabulary (simple spaced repetition) ───────────── */

const INTERVALS = [1, 2, 4, 7, 14, 30]

export function Vocabulary({ tracker, records }: { tracker: Tracker; records: TrackerRecord[] }) {
  const { today } = useApp()
  const toast = useToast()
  const confirm = useConfirm()
  const [word, setWord] = useState('')
  const [meaning, setMeaning] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'due' | 'all' | 'mastered'>('due')
  const [editing, setEditing] = useState<TrackerRecord | undefined>()
  const vocab = records.filter((r) => r.kind === 'vocab')
  const due = (r: TrackerRecord) => !r.values.mastered && (!r.values.nextReview || (r.values.nextReview as string) <= today)
  const list = vocab
    .filter((r) => (filter === 'due' ? due(r) : filter === 'mastered' ? !!r.values.mastered : true))
    .filter((r) => !q || (r.title + ' ' + (r.values.meaning ?? '')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title))

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!word.trim()) return
    if (vocab.some((v) => v.title.toLowerCase() === word.trim().toLowerCase())) return toast.error(`"${word.trim()}" is already in your list`)
    try {
      await addRecord({ trackerId: tracker.id, kind: 'vocab', title: word.trim(), values: { meaning: meaning.trim(), mastered: false, box: 0, nextReview: today } })
      setWord('')
      setMeaning('')
      toast.success('Word added')
    } catch (err) {
      toast.error(err)
    }
  }
  const review = (r: TrackerRecord, known: boolean) => {
    const box = known ? Math.min(INTERVALS.length - 1, ((r.values.box as number) ?? 0) + 1) : 0
    const mastered = known && box === INTERVALS.length - 1
    updateRecord(r.id, { values: { ...r.values, box, nextReview: addDays(today, known ? INTERVALS[box] : 1), mastered } }).catch(toast.error)
  }

  return (
    <Card>
      <CardHeader title="Vocabulary" subtitle={`${vocab.length} words · ${vocab.filter(due).length} due for review · ${vocab.filter((v) => v.values.mastered).length} mastered`} icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-learning-soft text-learning"><BookA className="h-4 w-4" /></span>} />
      <CardBody className="space-y-4">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="New word" aria-label="New word" className="sm:w-48" />
          <Input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Meaning" aria-label="Meaning" />
          <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />}>
            Add
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words" className="pl-9" aria-label="Search words" />
          </div>
          {(['due', 'all', 'mastered'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'soft' : 'ghost'} onClick={() => setFilter(f)} aria-pressed={filter === f}>
              {f === 'due' ? 'Due for review' : f === 'all' ? 'All' : 'Mastered'}
            </Button>
          ))}
        </div>
        {list.length === 0 ? (
          <EmptyState compact title={filter === 'due' ? 'Nothing due for review 🎉' : 'No words yet'} description={filter === 'due' ? 'Come back tomorrow or add new words.' : 'Add words you want to learn.'} />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={r.id} className="group flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    {r.title} {Boolean(r.values.mastered) && <Badge tone="good">Mastered</Badge>}
                  </p>
                  <p className="text-xs text-fg-2">{(r.values.meaning as string) || <span className="text-muted">No meaning yet</span>}</p>
                  {typeof r.values.example === 'string' && r.values.example && <p className="mt-0.5 text-[11px] text-muted italic">“{r.values.example}”</p>}
                  {!r.values.mastered && typeof r.values.nextReview === 'string' && <p className="text-[11px] text-muted">Review {relativeDays(r.values.nextReview, today).toLowerCase()}</p>}
                </div>
                {!r.values.mastered && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => review(r, false)}>
                      Again
                    </Button>
                    <Button size="sm" variant="soft" icon={<Check className="h-3.5 w-3.5" />} onClick={() => review(r, true)}>
                      Knew it
                    </Button>
                  </div>
                )}
                <div className="flex">
                  <Button size="icon-sm" variant="ghost" aria-label="Edit word" onClick={() => setEditing(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Delete word"
                    onClick={async () => {
                      if (await confirm({ title: 'Delete word?', message: `"${r.title}" will be removed.`, confirmLabel: 'Delete', danger: true })) deleteRecord(r.id).catch(toast.error)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <Modal open={!!editing} onClose={() => setEditing(undefined)} title="Edit word" size="sm">
        {editing && <VocabForm record={editing} onDone={() => setEditing(undefined)} />}
      </Modal>
    </Card>
  )
}

function VocabForm({ record, onDone }: { record: TrackerRecord; onDone: () => void }) {
  const [title, setTitle] = useState(record.title)
  const [meaning, setMeaning] = useState((record.values.meaning as string) ?? '')
  const [example, setExample] = useState((record.values.example as string) ?? '')
  const [mastered, setMastered] = useState(!!record.values.mastered)
  const { busy, errors, run } = useSubmit()
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => updateRecord(record.id, { title, values: { ...record.values, meaning, example, mastered } }), 'Word updated')) onDone()
      }}
    >
      <LabeledInput label="Word" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
      <LabeledInput label="Meaning" value={meaning} onChange={(e) => setMeaning(e.target.value)} />
      <LabeledInput label="Example sentence" value={example} onChange={(e) => setExample(e.target.value)} />
      <LabeledSelect label="Status" value={mastered ? 'yes' : 'no'} onChange={(e) => setMastered(e.target.value === 'yes')}>
        <option value="no">Learning</option>
        <option value="yes">Mastered</option>
      </LabeledSelect>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  )
}

/* ───────────── Revision schedule ───────────── */

export function RevisionSchedule({ tracker, records }: { tracker: Tracker; records: TrackerRecord[] }) {
  const { today } = useApp()
  const toast = useToast()
  const tasks = useTasks()
  const [taskEdit, setTaskEdit] = useState<Task | undefined>()
  const [addingTask, setAddingTask] = useState(false)
  const topics = useMemo(
    () =>
      records
        .filter((r) => r.kind === 'item' && (r.status === 'revise' || typeof r.values?.revisionDate === 'string') && r.status !== 'mastered')
        .sort((a, b) => ((a.values.revisionDate as string) ?? '9999').localeCompare((b.values.revisionDate as string) ?? '9999')),
    [records],
  )
  const studyTasks = (tasks ?? []).filter((t) => t.trackerId === tracker.id && !t.done).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const reschedule = (r: TrackerRecord, days: number) => updateRecord(r.id, { values: { ...r.values, revisionDate: addDays(today, days) } }).then(() => toast.success(`Next revision ${relativeDays(addDays(today, days), today).toLowerCase()}`)).catch(toast.error)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Topics to revise" subtitle="From topics marked “Needs revision” or with a revision date" icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-warn/15 text-warn"><RotateCcw className="h-4 w-4" /></span>} />
        <CardBody>
          {topics.length === 0 ? (
            <EmptyState compact title="No revisions scheduled" description="Add topics in the Topics tab and set a next revision date or mark them “Needs revision”." />
          ) : (
            <ul className="divide-y divide-line">
              {topics.map((r) => {
                const d = r.values.revisionDate as string | undefined
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg">{r.title}</p>
                      <p className={cn('text-xs', d && d < today ? 'text-bad-fg' : 'text-muted')}>
                        {(r.values.section as string) ?? ''} {d ? `· ${d < today ? 'Overdue — ' : ''}${relativeDays(d, today)}` : '· No date'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {[1, 3, 7].map((n) => (
                        <Button key={n} size="sm" variant="ghost" onClick={() => reschedule(r, n)} title={`Revised — next in ${n} day(s)`}>
                          +{n}d
                        </Button>
                      ))}
                      <Button size="sm" variant="soft" onClick={() => updateRecord(r.id, { status: 'mastered' }).then(() => toast.success('Marked mastered')).catch(toast.error)}>
                        Mastered
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Upcoming study tasks"
          subtitle="Tasks linked to this tracker"
          action={
            <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddingTask(true)}>
              Task
            </Button>
          }
        />
        <CardBody>
          {studyTasks.length === 0 ? (
            <EmptyState compact title="No study tasks" description="Create a task and link it to GRE / TOEFL." />
          ) : (
            <ul className="divide-y divide-line">
              {studyTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5">
                  <button className="text-left text-sm text-fg hover:underline" onClick={() => setTaskEdit(t)}>
                    {t.title}
                  </button>
                  <span className={cn('text-xs', t.dueDate && t.dueDate < today ? 'text-bad-fg' : 'text-muted')}>{t.dueDate ? relativeDays(t.dueDate, today) : 'No date'}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <TaskFormModal open={!!taskEdit} onClose={() => setTaskEdit(undefined)} task={taskEdit} />
      <TaskFormModal open={addingTask} onClose={() => setAddingTask(false)} preset={{ trackerId: tracker.id }} />
    </div>
  )
}
