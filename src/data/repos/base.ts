import type { BaseRow } from '../models'
import { nowISO, uid } from '@/lib/util'

export type NewRow<T extends BaseRow> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

export function stamp<T extends BaseRow>(data: NewRow<T>): T {
  const now = nowISO()
  return { ...data, id: data.id ?? uid(), createdAt: now, updatedAt: now } as T
}

export function touch<T extends object>(patch: T): T & { updatedAt: string } {
  return { ...patch, updatedAt: nowISO() }
}

/** Removes undefined/empty-string optional values so records stay clean. */
export function compact<T extends object>(o: T): T {
  const out = { ...o } as Record<string, unknown>
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === '') delete out[k]
  return out as T
}
