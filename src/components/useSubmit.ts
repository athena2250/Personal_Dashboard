import { useState } from 'react'
import { ValidationError } from '@/data/saveStatus'
import { useToast } from './ui/feedback'

/**
 * Runs a save action: tracks busy state, maps ValidationError issues to field errors,
 * and toasts other failures. Success toasts are only shown after the write resolved.
 */
export function useSubmit() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  /** Returns true when the action succeeded. */
  async function run(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(true)
    setErrors({})
    try {
      await fn()
      if (success) toast.success(success)
      return true
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.issues)
      else toast.error(err)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, errors, setErrors, run }
}
