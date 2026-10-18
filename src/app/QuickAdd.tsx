import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { TaskFormModal } from '@/modules/home/TaskForm'
import { SessionFormModal } from '@/modules/learning/SessionForm'
import { TransactionFormModal } from '@/modules/spending/TransactionForm'
import { InvestmentFormModal, InvTxnFormModal, ValuationFormModal } from '@/modules/wealth/forms'
import { EventFormModal } from '@/modules/events/EventForm'

export type QuickKind = 'task' | 'session' | 'expense' | 'income' | 'investment' | 'invEntry' | 'valuation' | 'event'

interface QuickState {
  kind: QuickKind
  trackerId?: string
  investmentId?: string
  date?: string
  time?: string
}

const Ctx = createContext<((kind: QuickKind, opts?: Omit<QuickState, 'kind'>) => void) | null>(null)

/** Global "add anything" dialogs, available from any page via useQuickAdd(). */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<QuickState | null>(null)
  const open = useCallback((kind: QuickKind, opts?: Omit<QuickState, 'kind'>) => setState({ kind, ...opts }), [])
  const close = () => setState(null)
  const k = state?.kind
  return (
    <Ctx.Provider value={useMemo(() => open, [open])}>
      {children}
      <TaskFormModal open={k === 'task'} onClose={close} />
      <SessionFormModal open={k === 'session'} onClose={close} trackerId={state?.trackerId} />
      <TransactionFormModal open={k === 'expense' || k === 'income'} onClose={close} presetType={k === 'income' ? 'income' : 'expense'} />
      <InvestmentFormModal open={k === 'investment'} onClose={close} />
      <InvTxnFormModal open={k === 'invEntry'} onClose={close} investmentId={state?.investmentId} />
      <ValuationFormModal open={k === 'valuation'} onClose={close} investmentId={state?.investmentId} />
      <EventFormModal open={k === 'event'} onClose={close} presetDate={state?.date} presetTime={state?.time} />
    </Ctx.Provider>
  )
}

export function useQuickAdd() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useQuickAdd outside provider')
  return c
}
