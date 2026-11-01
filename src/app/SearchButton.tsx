import { useOutletContext } from 'react-router'
import { Search } from 'lucide-react'
import { Kbd } from '@/components/ui/display'
import { cn } from '@/lib/util'

export interface LayoutOutletContext {
  openPalette: () => void
}

/** Opens the global command palette (search). Must render inside the app Layout's <Outlet>. */
export function usePalette() {
  return useOutletContext<LayoutOutletContext>().openPalette
}

export function SearchButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex h-9 items-center gap-2 rounded-xl border border-line bg-surface-2/70 px-3 text-sm text-muted transition-colors hover:border-line-strong', className)}
      aria-label="Search everything"
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 truncate text-left">Search everything…</span>
      <span className="hidden sm:inline">
        <Kbd>⌘K</Kbd>
      </span>
    </button>
  )
}
