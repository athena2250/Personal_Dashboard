import { useEffect, useState } from 'react'

export interface ChartTheme {
  series: string[]
  grid: string
  axis: string
  ink: string
  surface: string
  fg: string
  learning: string
  spending: string
  wealth: string
  events: string
  good: string
  warn: string
  bad: string
  muted: string
}

function read(): ChartTheme {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
    grid: v('--chart-grid'),
    axis: v('--chart-axis'),
    ink: v('--chart-ink'),
    surface: v('--surface'),
    fg: v('--fg'),
    learning: v('--learning'),
    spending: v('--spending'),
    wealth: v('--wealth'),
    events: v('--events'),
    good: v('--good'),
    warn: v('--warn'),
    bad: v('--bad'),
    muted: v('--muted'),
  }
}

/** Resolved chart colours for the current theme; updates when data-theme changes. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}
