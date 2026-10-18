import { useState } from 'react'
import { Pencil, Plus, Target, Trash2, Flag } from 'lucide-react'
import type { GoalDef, GoalMetric, GoalPeriod, LearningSession, Tracker, TrackerRecord } from '@/data/models'
import { updateTracker } from '@/data/repos/trackers'
import { goalProgress } from '@/domain/activity'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar } from '@/components/ui/display'
import { LabeledInput, LabeledSelect } from '@/components/ui/forms'
import { Modal } from '@/components/ui/Modal'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useSubmit } from '@/components/useSubmit'
import { useApp } from '@/app/AppContext'
import { formatMinutes, relativeDays } from '@/lib/dates'
import { uid, cn } from '@/lib/util'

const PERIOD_LABEL: Record<GoalPeriod, string> = { day: 'today', week: 'this week', month: 'this month', total: 'overall' }

export function metricLabel(metric: GoalMetric, tracker: Tracker) {
  return { minutes: 'Minutes', sessions: 'Sessions', count: tracker.countLabel || 'Count', recordsDone: `${tracker.recordLabel || 'Item'}s completed` }[metric]
}

function fmtValue(metric: GoalMetric, v: number) {
  return metric === 'minutes' ? formatMinutes(v) : String(v)
}

export function GoalsPanel({ tracker, sessions, records, compact }: { tracker: Tracker; sessions: LearningSession[]; records: TrackerRecord[]; compact?: boolean }) {
  const { today, settings } = useApp()
  const confirm = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState<GoalDef | null | undefined>(undefined)
  const deadlines = records
    .filter((r) => r.kind === 'item' && r.deadline && !tracker.statuses.find((s) => s.id === r.status)?.done)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .slice(0, 6)

  const remove = async (g: GoalDef) => {
    if (!(await confirm({ title: 'Delete goal?', message: `"${g.title}" will be removed.`, confirmLabel: 'Delete', danger: true }))) return
    updateTracker(tracker.id, { goals: tracker.goals.filter((x) => x.id !== g.id) })
      .then(() => toast.success('Goal deleted'))
      .catch(toast.error)
  }

  return (
    <Card className="h-full">
      <CardHeader
        title="Goals & deadlines"
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent"><Target className="h-4 w-4" /></span>}
        action={
          <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(null)}>
            Goal
          </Button>
        }
      />
      <CardBody>
        {tracker.goals.length === 0 ? (
          <EmptyState compact title="No goals yet" description="Set a daily, weekly or monthly target." action={<Button size="sm" onClick={() => setEditing(null)}>Add a goal</Button>} />
        ) : (
          <ul className="space-y-4">
            {tracker.goals.map((g) => {
              const p = goalProgress(g, sessions, records, tracker, today, settings.weekStartsOn)
              return (
                <li key={g.id} className="group">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-fg">{g.title}</span>
                    <span className="flex items-center gap-1">
                      {p.pct >= 1 && <Badge tone="good">Done</Badge>}
                      {p.overdue && <Badge tone="bad">Overdue</Badge>}
                      <Button variant="ghost" size="icon-sm" aria-label="Edit goal" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => setEditing(g)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Delete goal" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => remove(g)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </div>
                  <ProgressBar value={p.pct} color={p.pct >= 1 ? 'var(--good)' : tracker.color} height="h-2" label={g.title} />
                  <p className="mt-1 text-[11px] text-muted">
                    {fmtValue(g.metric, p.value)} / {fmtValue(g.metric, g.target)} {PERIOD_LABEL[g.period]}
                    {g.deadline ? ` · by ${relativeDays(g.deadline, today)}` : ''}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
        {!compact && deadlines.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Upcoming deadlines</p>
            <ul className="space-y-1.5">
              {deadlines.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-fg-2">
                    <Flag className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="truncate">{r.title}</span>
                  </span>
                  <span className={cn('shrink-0 text-xs', r.deadline! < today ? 'text-bad-fg' : 'text-muted')}>{relativeDays(r.deadline!, today)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
      <GoalModal tracker={tracker} goal={editing} onClose={() => setEditing(undefined)} />
    </Card>
  )
}

function GoalModal({ tracker, goal, onClose }: { tracker: Tracker; goal: GoalDef | null | undefined; onClose: () => void }) {
  return (
    <Modal open={goal !== undefined} onClose={onClose} title={goal ? 'Edit goal' : 'New goal'} size="sm">
      {goal !== undefined && <GoalForm tracker={tracker} goal={goal ?? undefined} onDone={onClose} />}
    </Modal>
  )
}

function GoalForm({ tracker, goal, onDone }: { tracker: Tracker; goal?: GoalDef; onDone: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? '')
  const [metric, setMetric] = useState<GoalMetric>(goal?.metric ?? 'minutes')
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'week')
  const [target, setTarget] = useState(goal ? String(goal.target) : '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const { busy, errors, setErrors, run } = useSubmit()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = Number(target)
    if (!(t > 0)) return setErrors({ target: 'Target must be greater than zero' })
    const g: GoalDef = {
      id: goal?.id ?? uid(),
      title: title.trim() || `${t} ${metricLabel(metric, tracker).toLowerCase()} ${PERIOD_LABEL[period]}`,
      metric,
      period,
      target: t,
      deadline: deadline || undefined,
    }
    const goals = goal ? tracker.goals.map((x) => (x.id === goal.id ? g : x)) : [...tracker.goals, g]
    if (await run(() => updateTracker(tracker.id, { goals }), goal ? 'Goal updated' : 'Goal added')) onDone()
  }
  const metrics: GoalMetric[] = ['minutes', 'sessions', ...(tracker.countLabel ? (['count'] as GoalMetric[]) : []), 'recordsDone']
  return (
    <form onSubmit={submit} className="space-y-4">
      <LabeledInput label="Goal name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Study 5 hours a week" autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <LabeledSelect label="Measure" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
          {metrics.map((m) => (
            <option key={m} value={m}>
              {metricLabel(m, tracker)}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="Period" value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)}>
          <option value="day">Per day</option>
          <option value="week">Per week</option>
          <option value="month">Per month</option>
          <option value="total">Overall</option>
        </LabeledSelect>
        <LabeledInput label={`Target (${metric === 'minutes' ? 'minutes' : 'number'})`} type="number" min="1" required value={target} onChange={(e) => setTarget(e.target.value)} error={errors.target} />
        <LabeledInput label="Deadline (optional)" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save goal
        </Button>
      </div>
    </form>
  )
}
