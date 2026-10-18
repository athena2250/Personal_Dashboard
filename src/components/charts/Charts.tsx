/**
 * Thin, themed wrappers around Recharts. Thin marks, rounded data-ends, recessive grid,
 * hover tooltips by default, one y-axis only.
 */
import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useChartTheme } from './useChartTheme'
import { cn } from '@/lib/util'

export interface SeriesDef {
  key: string
  label: string
  color?: string
  dashed?: boolean
}

type Fmt = (v: number) => string

interface TooltipPayloadItem {
  name?: string
  value?: number
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

function ChartTooltip({ active, payload, label, format, labelFormat }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string | number; format?: Fmt; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[140px] rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs shadow-xl">
      {label != null && <div className="mb-1 font-medium text-fg">{labelFormat ? labelFormat(String(label)) : label}</div>}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-2">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular font-medium text-fg">{format ? format(Number(p.value)) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Legend({ items, className }: { items: { label: ReactNode; color: string; value?: ReactNode; dashed?: boolean }[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-2', className)}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {it.dashed ? <span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: it.color }} /> : <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />}
          {it.label}
          {it.value != null && <span className="tabular font-medium text-fg">{it.value}</span>}
        </span>
      ))}
    </div>
  )
}

function axisProps(ink: string) {
  return { tickLine: false, axisLine: false, tick: { fill: ink, fontSize: 11 }, tickMargin: 8 }
}

export function TrendChart({
  data,
  xKey,
  series,
  height = 220,
  formatY,
  formatX,
  area = true,
  showLegend,
  yWidth = 48,
  referenceY,
}: {
  data: Record<string, unknown>[]
  xKey: string
  series: SeriesDef[]
  height?: number
  formatY?: Fmt
  formatX?: (v: string) => string
  area?: boolean
  showLegend?: boolean
  yWidth?: number
  referenceY?: { value: number; label: string }
}) {
  const t = useChartTheme()
  const colors = series.map((s, i) => s.color ?? t.series[i % 8])
  const Chart = area ? AreaChart : LineChart
  return (
    <div>
      {showLegend && series.length > 1 && <Legend className="mb-3" items={series.map((s, i) => ({ label: s.label, color: colors[i], dashed: s.dashed }))} />}
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[i]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={colors[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey={xKey} {...axisProps(t.ink)} tickFormatter={formatX} minTickGap={16} />
            <YAxis {...axisProps(t.ink)} width={yWidth} tickFormatter={formatY} allowDecimals={false} />
            <Tooltip cursor={{ stroke: t.axis, strokeWidth: 1 }} content={(p) => <ChartTooltip {...(p as object)} format={formatY} labelFormat={formatX} />} />
            {referenceY && <ReferenceLine y={referenceY.value} stroke={t.muted} strokeDasharray="4 4" label={{ value: referenceY.label, fill: t.ink, fontSize: 11, position: 'insideTopRight' }} />}
            {series.map((s, i) =>
              area ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={colors[i]}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  fill={s.dashed ? 'transparent' : `url(#grad-${s.key})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: t.surface }}
                  isAnimationActive={false}
                />
              ) : (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i]} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={data.length < 16 ? { r: 3, strokeWidth: 2, stroke: t.surface, fill: colors[i] } : false} activeDot={{ r: 4, strokeWidth: 2, stroke: t.surface }} connectNulls isAnimationActive={false} />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function BarsChart({
  data,
  xKey,
  series,
  height = 220,
  formatY,
  formatX,
  stacked,
  showLegend,
  yWidth = 48,
  layout = 'horizontal',
  colorByIndex,
}: {
  data: Record<string, unknown>[]
  xKey: string
  series: SeriesDef[]
  height?: number
  formatY?: Fmt
  formatX?: (v: string) => string
  stacked?: boolean
  showLegend?: boolean
  yWidth?: number
  layout?: 'horizontal' | 'vertical'
  colorByIndex?: string[]
}) {
  const t = useChartTheme()
  const colors = series.map((s, i) => s.color ?? t.series[i % 8])
  const vertical = layout === 'vertical'
  return (
    <div>
      {showLegend && series.length > 1 && <Legend className="mb-3" items={series.map((s, i) => ({ label: s.label, color: colors[i] }))} />}
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={layout} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={vertical} horizontal={!vertical} stroke={t.grid} />
            {vertical ? (
              <>
                <XAxis type="number" {...axisProps(t.ink)} tickFormatter={formatY} />
                <YAxis type="category" dataKey={xKey} {...axisProps(t.ink)} width={yWidth} tickFormatter={formatX} />
              </>
            ) : (
              <>
                <XAxis dataKey={xKey} {...axisProps(t.ink)} tickFormatter={formatX} minTickGap={8} />
                <YAxis {...axisProps(t.ink)} width={yWidth} tickFormatter={formatY} allowDecimals={false} />
              </>
            )}
            <Tooltip cursor={{ fill: t.grid, opacity: 0.5 }} content={(p) => <ChartTooltip {...(p as object)} format={formatY} labelFormat={formatX} />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={colors[i]}
                stackId={stacked ? 'a' : undefined}
                radius={stacked ? (i === series.length - 1 ? (vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) : vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={28}
                stroke={stacked ? t.surface : undefined}
                strokeWidth={stacked ? 1 : 0}
                isAnimationActive={false}
              >
                {colorByIndex && data.map((_, j) => <Cell key={j} fill={colorByIndex[j % colorByIndex.length]} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export interface DonutSlice {
  label: string
  value: number
  color: string
}

export function Donut({ data, size = 168, thickness = 18, center, format }: { data: DonutSlice[]; size?: number; thickness?: number; center?: ReactNode; format?: Fmt }) {
  const t = useChartTheme()
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={total > 0 ? data : [{ label: 'None', value: 1, color: t.grid }]}
            dataKey="value"
            nameKey="label"
            innerRadius={size / 2 - thickness}
            outerRadius={size / 2}
            paddingAngle={data.length > 1 ? 2 : 0}
            cornerRadius={4}
            stroke={t.surface}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {(total > 0 ? data : [{ color: t.grid }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          {total > 0 && <Tooltip content={(p) => <ChartTooltip {...(p as object)} format={format} />} />}
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  )
}

/** Donut with a value legend beside it (the legend doubles as the accessible table). */
export function DonutWithLegend({ data, center, format, size = 160 }: { data: DonutSlice[]; center?: ReactNode; format: Fmt; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-5 @sm:flex-row @sm:items-center">
      <Donut data={data} center={center} format={format} size={size} />
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-fg-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="tabular shrink-0 text-fg">
              {format(d.value)}
              <span className="ml-2 text-xs text-muted">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  )
}

/** Tiny sparkline for stat cards. */
export function Sparkline({ values, color, height = 36 }: { values: number[]; color?: string; height?: number }) {
  const t = useChartTheme()
  const c = color ?? t.series[0]
  const data = values.map((v, i) => ({ i, v }))
  return (
    <div style={{ height }} className="w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${c.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.3} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={c} strokeWidth={1.75} fill={`url(#spark-${c.replace(/[^a-z0-9]/gi, '')})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
