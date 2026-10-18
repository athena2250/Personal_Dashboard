import { Outlet } from 'react-router'
import { Plus, RefreshCw, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/display'
import { useQuickAdd } from '@/app/QuickAdd'
import { SubNav } from '@/modules/spending/SpendingLayout'

const TABS = [
  { to: '/wealth', label: 'Overview', end: true },
  { to: '/wealth/holdings', label: 'Holdings' },
  { to: '/wealth/contributions', label: 'Contributions' },
  { to: '/wealth/import', label: 'Import & spreadsheets' },
]

export function WealthLayout() {
  const quick = useQuickAdd()
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Dashboard"
        title="Wealth Tracker"
        subtitle="Invested capital, valuations and net worth. No live prices are fetched; values come from what you enter."
        icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-wealth-soft text-wealth"><TrendingUp className="h-6 w-6" /></span>}
        actions={
          <>
            <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => quick('valuation')}>
              Update value
            </Button>
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => quick('invEntry')}>
              Contribution
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => quick('investment')}>
              Investment
            </Button>
          </>
        }
      />
      <SubNav tabs={TABS} accent="var(--wealth)" />
      <Outlet />
    </div>
  )
}
