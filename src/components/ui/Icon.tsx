import {
  Award,
  Bike,
  BookOpen,
  BrainCircuit,
  Briefcase,
  Camera,
  Code2,
  Coffee,
  Dumbbell,
  FlaskConical,
  Globe,
  GraduationCap,
  HeartPulse,
  Languages,
  Leaf,
  Lightbulb,
  Mountain,
  Music,
  Palette,
  PenTool,
  Rocket,
  Star,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

/** Curated icon set for user-created trackers (keeps the bundle small). */
export const ICONS: Record<string, LucideIcon> = {
  Award,
  Bike,
  BookOpen,
  BrainCircuit,
  Briefcase,
  Camera,
  Code2,
  Coffee,
  Dumbbell,
  FlaskConical,
  Globe,
  GraduationCap,
  HeartPulse,
  Languages,
  Leaf,
  Lightbulb,
  Mountain,
  Music,
  Palette,
  PenTool,
  Rocket,
  Star,
  Target,
  Trophy,
}

export function TrackerIcon({ name, className, color, boxed = true, size = 'md' }: { name: string; className?: string; color?: string; boxed?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = ICONS[name] ?? Target
  const box = { sm: 'h-7 w-7 rounded-lg', md: 'h-9 w-9 rounded-xl', lg: 'h-12 w-12 rounded-2xl' }[size]
  const icon = { sm: 'h-3.5 w-3.5', md: 'h-4.5 w-4.5', lg: 'h-6 w-6' }[size]
  if (!boxed) return <Icon className={className ?? icon} style={{ color }} aria-hidden />
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${className ?? ''}`} style={{ background: `color-mix(in oklab, ${color ?? 'var(--accent)'} 16%, transparent)`, color: color ?? 'var(--accent)' }}>
      <Icon className={icon} aria-hidden />
    </span>
  )
}
