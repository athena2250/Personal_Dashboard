import { NavLink, Outlet } from 'react-router'
import { Plus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/display'
import { useQuickAdd } from '@/app/QuickAdd'
import { cn } from '@/lib/util'

const TABS = [
  { to: '/spending', label: 'Overview', end: true },
  { to: '/spending/transactions', label: 'Transactions' },
  { to: '/spending/budgets', label: 'Budgets' },
  { to: '/spending/recurring', label: 'Recurring' },
  { to: '/spending/reports', label: 'Reports' },
  { to: '/spending/categories', label: 'Categories' },
]

export function SubNav({ tabs, accent }: { tabs: { to: string; label: string; end?: boolean }[]; accent: string }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <nav className="inline-flex min-w-full gap-1 border-b border-line sm:min-w-0" aria-label="Section">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => cn('-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors', isActive ? 'text-fg' : 'border-transparent text-muted hover:text-fg')}
            style={({ isActive }) => (isActive ? { borderColor: accent } : undefined)}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function SpendingLayout() {
  const quick = useQuickAdd()
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Dashboard"
        title="Spending Control"
        subtitle="Transactions, budgets, recurring bills and reports — calculated only from what you record."
        icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-spending-soft text-spending"><Wallet className="h-6 w-6" /></span>}
        actions={
          <>
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => quick('income')}>
              Income
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => quick('expense')}>
              Expense
            </Button>
          </>
        }
      />
      <SubNav tabs={TABS} accent="var(--spending)" />
      <Outlet />
    </div>
  )
}
