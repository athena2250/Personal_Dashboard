import { useMemo, useState } from 'react'
import type { LearningSession } from '@/data/models'
import { heatmapGrid, type HeatCell } from '@/domain/activity'
import { formatDate, formatMinutes, weekdayShort, type ISODate } from '@/lib/dates'

const CELL = 11
const GAP = 3

/** GitHub-style activity heatmap (one-hue sequential ramp) with hover/focus tooltips. */
export function Heatmap({
  sessions,
  today,
  weeks = 53,
  weekStartsOn = 1,
  onSelectDay,
}: {
  sessions: Pick<LearningSession, 'date' | 'minutes' | 'count'>[]
  today: ISODate
  weeks?: number
  weekStartsOn?: 0 | 1
  onSelectDay?: (d: ISODate) => void
}) {
  const grid = useMemo(() => heatmapGrid(sessions, today, weeks, weekStartsOn), [sessions, today, weeks, weekStartsOn])
  const [hover, setHover] = useState<{ cell: HeatCell; x: number; y: number } | null>(null)
  const width = weeks * (CELL + GAP)
  const height = 7 * (CELL + GAP)
  const LEFT = 26
  const TOP = 16

  const monthLabels: { x: number; label: string }[] = []
  let lastMonth = ''
  grid.forEach((col, w) => {
    const m = col[0].date.slice(0, 7)
    if (m !== lastMonth) {
      const label = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(new Date(col[0].date + 'T00:00:00Z'))
      if (!monthLabels.length || w * (CELL + GAP) - monthLabels[monthLabels.length - 1].x > 26) monthLabels.push({ x: w * (CELL + GAP), label })
      lastMonth = m
    }
  })

  const totalDays = grid.flat().filter((c) => c.sessions > 0 && !c.future).length

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1">
        <svg width={width + LEFT} height={height + TOP} role="img" aria-label={`Activity heatmap: ${totalDays} active days in the last ${weeks} weeks`} className="block">
          {monthLabels.map((m) => (
            <text key={m.x} x={LEFT + m.x} y={10} fontSize={10} style={{ fill: 'var(--muted)' }}>
              {m.label}
            </text>
          ))}
          {[1, 3, 5].map((row) => (
            <text key={row} x={0} y={TOP + row * (CELL + GAP) + CELL - 2} fontSize={9} style={{ fill: 'var(--muted)' }}>
              {weekdayShort((row + weekStartsOn) % 7).slice(0, 3)}
            </text>
          ))}
          {grid.map((col, w) =>
            col.map((cell, d) =>
              cell.future ? null : (
                <rect
                  key={cell.date}
                  x={LEFT + w * (CELL + GAP)}
                  y={TOP + d * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={2.5}
                  tabIndex={cell.sessions > 0 ? 0 : -1}
                  style={{ fill: `var(--heat-${cell.level})`, cursor: onSelectDay ? 'pointer' : 'default', outline: 'none' }}
                  onMouseEnter={(e) => setHover({ cell, x: (e.target as SVGRectElement).getBoundingClientRect().left, y: (e.target as SVGRectElement).getBoundingClientRect().top })}
                  onFocus={(e) => setHover({ cell, x: (e.target as SVGRectElement).getBoundingClientRect().left, y: (e.target as SVGRectElement).getBoundingClientRect().top })}
                  onMouseLeave={() => setHover(null)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelectDay?.(cell.date)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelectDay?.(cell.date)
                  }}
                  aria-label={`${formatDate(cell.date, 'weekday')}: ${cell.sessions ? `${cell.sessions} session${cell.sessions > 1 ? 's' : ''}, ${formatMinutes(cell.minutes)}` : 'No activity'}`}
                />
              ),
            ),
          )}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span>{totalDays} active days</span>
        <span className="flex items-center gap-1">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `var(--heat-${l})` }} />
          ))}
          More
        </span>
      </div>
      {hover && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs shadow-xl" style={{ left: hover.x + CELL / 2, top: hover.y - 6 }}>
          <div className="font-medium text-fg">{formatDate(hover.cell.date, 'weekday')}</div>
          <div className="text-muted">{hover.cell.sessions ? `${hover.cell.sessions} session${hover.cell.sessions > 1 ? 's' : ''} · ${formatMinutes(hover.cell.minutes)}` : 'No activity'}</div>
        </div>
      )}
    </div>
  )
}
