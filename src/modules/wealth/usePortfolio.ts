import { useMemo } from 'react'
import { useInvestments, useInvTxns, useValuations } from '@/data/hooks'
import { portfolioSummary } from '@/domain/wealth'

export function usePortfolio(today: string) {
  const investments = useInvestments()
  const txns = useInvTxns()
  const vals = useValuations()
  const summary = useMemo(() => (investments && txns && vals ? portfolioSummary(investments, txns, vals, today) : undefined), [investments, txns, vals, today])
  return { investments, txns, vals, summary }
}
