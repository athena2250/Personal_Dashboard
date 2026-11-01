import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, LayoutGrid, RotateCcw } from 'lucide-react'
import type { WidgetId, WidgetPref } from '@/data/models'
import { updateSettings } from '@/data/repos/settings'
import { DEFAULT_WIDGETS } from '@/data/defaults'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/feedback'
import { useApp } from '@/app/AppContext'
import { SearchButton, usePalette } from '@/app/SearchButton'
import { formatDate } from '@/lib/dates'
import { zonedParts } from '@/lib/tz'
import { cn } from '@/lib/util'
import { EventsWidget, HeatmapWidget, LearningWidget, QuickActionsWidget, SpendingWidget, TrackersWidget, WealthWidget } from './widgets'
import { Onboarding } from './Onboarding'
import banner from '@/assets/hq-banner.jpg'

export const WIDGET_META: Record<WidgetId, { label: string; span: string }> = {
  quickActions: { label: 'Quick actions', span: 'lg:col-span-12' },
  learning: { label: 'Learning progress', span: 'md:col-span-1 lg:col-span-6' },
  spending: { label: 'Spending summary', span: 'md:col-span-1 lg:col-span-6' },
  wealth: { label: 'Wealth overview', span: 'md:col-span-1 lg:col-span-6' },
  events: { label: 'Upcoming events', span: 'md:col-span-1 lg:col-span-6' },
  heatmap: { label: 'Learning heatmap', span: 'lg:col-span-12' },
  trackers: { label: 'All trackers', span: 'lg:col-span-12' },
}

function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage() {
  const { settings, today } = useApp()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [dragId, setDragId] = useState<WidgetId | null>(null)
  const widgets = settings.dashboardWidgets
  const hour = zonedParts(Date.now()).hour
  const openPalette = usePalette()

  const save = (next: WidgetPref[]) => updateSettings({ dashboardWidgets: next }).catch(toast.error)
  const move = (id: WidgetId, dir: -1 | 1) => {
    const i = widgets.findIndex((w) => w.id === id)
    const j = i + dir
    if (j < 0 || j >= widgets.length) return
    const next = [...widgets]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  const toggle = (id: WidgetId) => save(widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)))
  const dropOn = (target: WidgetId) => {
    if (!dragId || dragId === target) return
    const next = widgets.filter((w) => w.id !== dragId)
    const idx = next.findIndex((w) => w.id === target)
    next.splice(idx, 0, widgets.find((w) => w.id === dragId)!)
    save(next)
    setDragId(null)
  }

  const render = (id: WidgetId): ReactNode => {
    switch (id) {
      case 'quickActions':
        return <QuickActionsWidget />
      case 'learning':
        return <LearningWidget />
      case 'spending':
        return <SpendingWidget />
      case 'wealth':
        return <WealthWidget />
      case 'events':
        return <EventsWidget />
      case 'heatmap':
        return <HeatmapWidget />
      case 'trackers':
        return <TrackersWidget />
    }
  }

  const shown = editing ? widgets : widgets.filter((w) => w.visible)

  return (
    <div className="animate-fade-up">
      <img
        src={banner}
        alt="Personal HQ: Life · Work · Study · Build · Grow"
        width={2172}
        height={724}
        className="mb-8 aspect-[3/1] w-full rounded-2xl border border-line object-cover shadow-card"
      />
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="shrink-0">
          <p className="label-os text-muted">{formatDate(today, 'long')}</p>
          <h1 className="mt-2 text-[28px] font-semibold text-fg sm:text-[34px]">
            {greeting(hour)}
            {settings.name ? `, ${settings.name}` : ''}!
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:w-full sm:max-w-md">
          <SearchButton onClick={openPalette} className="min-w-0 flex-1" />
          {editing && (
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => save(DEFAULT_WIDGETS)}>
              Reset layout
            </Button>
          )}
          {editing ? (
            <Button variant="primary" size="sm" onClick={() => setEditing(false)} aria-pressed>
              Done
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Customize dashboard" title="Customize dashboard">
              <LayoutGrid className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!settings.onboarded && <Onboarding />}

      {editing && <p className="mb-4 rounded-xl border border-dashed border-line-strong px-4 py-3 text-xs text-fg-2">Drag widgets to reorder (or use the arrows), and use the eye button to show or hide them. Changes save automatically.</p>}

      <div className="grid grid-flow-dense grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-12">
        {shown.map((w, i) => (
          <div
            key={w.id}
            className={cn('min-w-0 md:col-span-2', WIDGET_META[w.id].span, editing && 'relative rounded-2xl ring-2 ring-dashed ring-line-strong ring-offset-4 ring-offset-[var(--bg)]', editing && !w.visible && 'opacity-45', dragId === w.id && 'opacity-40')}
            draggable={editing}
            onDragStart={() => setDragId(w.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => editing && e.preventDefault()}
            onDrop={() => dropOn(w.id)}
          >
            {editing && (
              <div className="absolute -top-3 right-3 z-10 flex items-center gap-0.5 rounded-xl border border-line-strong bg-surface p-0.5 shadow-lg">
                <span className="flex cursor-grab items-center gap-1 px-2 text-xs text-fg-2">
                  <GripVertical className="h-3.5 w-3.5" />
                  {WIDGET_META[w.id].label}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={() => move(w.id, -1)} disabled={i === 0} aria-label={`Move ${WIDGET_META[w.id].label} up`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => move(w.id, 1)} disabled={i === shown.length - 1} aria-label={`Move ${WIDGET_META[w.id].label} down`}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => toggle(w.id)} aria-label={w.visible ? `Hide ${WIDGET_META[w.id].label}` : `Show ${WIDGET_META[w.id].label}`}>
                  {w.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
            <div className={cn('h-full', editing && 'pointer-events-none select-none')}>{render(w.id)}</div>
          </div>
        ))}
      </div>
      {!editing && widgets.every((w) => !w.visible) && (
        <div className="py-16 text-center text-sm text-muted">
          All widgets are hidden. <button className="text-accent hover:underline" onClick={() => setEditing(true)}>Customize</button> to add some back.
        </div>
      )}
    </div>
  )
}
