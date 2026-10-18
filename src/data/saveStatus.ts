/**
 * Global save-status store: tracks in-flight writes and the last error so the UI can show
 * "Saving… / Saved / Save failed" honestly (only after the IndexedDB write resolves).
 */
import { useSyncExternalStore } from 'react'

interface SaveState {
  pending: number
  lastSavedAt: number | null
  lastError: string | null
}

let state: SaveState = { pending: 0, lastSavedAt: null, lastError: null }
const listeners = new Set<() => void>()

function set(next: Partial<SaveState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export class ValidationError extends Error {
  issues: Record<string, string>
  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Please check the form.')
    this.name = 'ValidationError'
    this.issues = issues
  }
}

/** Wraps a persistence operation, tracking pending/saved/error state. */
export async function tracked<T>(fn: () => Promise<T>): Promise<T> {
  set({ pending: state.pending + 1 })
  try {
    const result = await fn()
    set({ pending: Math.max(0, state.pending - 1), lastSavedAt: Date.now(), lastError: null })
    return result
  } catch (err) {
    const message = err instanceof ValidationError ? null : err instanceof Error ? err.message : String(err)
    set({ pending: Math.max(0, state.pending - 1), lastError: message ?? state.lastError })
    throw err
  }
}

export function useSaveStatus(): SaveState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
