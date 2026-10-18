import { Link } from 'react-router'
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Layers, Plus } from 'lucide-react'
import { useRecords, useSessions, useTrackers } from '@/data/hooks'
import { reorderTrackers, setTrackerArchived } from '@/data/repos/trackers'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, Card, Loading, PageHeader } from '@/components/ui/display'
import { TrackerIcon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/feedback'
import { formatHours } from '@/lib/dates'

export function TrackersListPage() {
  const trackers = useTrackers({ includeArchived: true })
  const sessions = useSessions()
  const records = useRecords()
  const toast = useToast()
  if (!trackers || !sessions || !records) return <Loading />
  const active = trackers.filter((t) => !t.archived)
  const archived = trackers.filter((t) => t.archived)
  const move = (i: number, dir: -1 | 1) => {
    const ids = active.map((t) => t.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorderTrackers([...ids, ...archived.map((t) => t.id)]).catch(toast.error)
  }
  const Row = ({ t, i }: { t: (typeof trackers)[number]; i?: number }) => {
    const mins = sessions.filter((s) => s.trackerId === t.id).reduce((s, x) => s + x.minutes, 0)
    const n = records.filter((r) => r.trackerId === t.id).length
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <TrackerIcon name={t.icon} color={t.color} />
        <Link to={`/trackers/${t.id}`} className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium text-fg hover:underline">
            {t.name}
            <Badge tone={t.section === 'learning' ? 'learning' : 'default'}>{t.section === 'learning' ? 'Learning Hub' : 'Collection'}</Badge>
            {t.template !== 'custom' && <Badge>Built-in</Badge>}
          </p>
          <p className="truncate text-xs text-muted">
            {t.fields.length} fields · {n} records · {formatHours(mins)} logged{t.description ? ` · ${t.description}` : ''}
          </p>
        </Link>
        {i != null && (
          <div className="hidden sm:flex">
            <Button size="icon-sm" variant="ghost" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Move ${t.name} down`} disabled={i === active.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={t.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          onClick={() =>
            setTrackerArchived(t.id, !t.archived)
              .then(() => toast.success(t.archived ? `${t.name} restored` : `${t.name} archived`))
              .catch(toast.error)
          }
        >
          {t.archived ? 'Restore' : 'Archive'}
        </Button>
      </li>
    )
  }
  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="All trackers"
        subtitle="Create trackers for anything — books, fitness, certifications, side projects. Order here sets sidebar order."
        icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Layers className="h-6 w-6" /></span>}
        actions={
          <ButtonLink to="/trackers/new" variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
            New tracker
          </ButtonLink>
        }
      />
      <Card>
        <ul className="divide-y divide-line">
          {active.map((t, i) => (
            <Row key={t.id} t={t} i={i} />
          ))}
        </ul>
      </Card>
      {archived.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-fg-2">Archived</h2>
          <Card className="opacity-80">
            <ul className="divide-y divide-line">
              {archived.map((t) => (
                <Row key={t.id} t={t} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
