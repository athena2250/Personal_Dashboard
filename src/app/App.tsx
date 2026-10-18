import { createBrowserRouter, Navigate, Outlet, RouterProvider, useRouteError } from 'react-router'
import { ConfirmProvider, ToastProvider } from '@/components/ui/feedback'
import { AppProvider } from './AppContext'
import { QuickAddProvider } from './QuickAdd'
import { Layout } from './Layout'
import { HomePage } from '@/modules/home/HomePage'
import { LearningHubPage } from '@/modules/learning/LearningHubPage'
import { TrackerPage } from '@/modules/trackers/TrackerPage'
import { TrackersListPage } from '@/modules/trackers/TrackersListPage'
import { TrackerBuilderPage } from '@/modules/trackers/TrackerBuilderPage'
import { SpendingLayout } from '@/modules/spending/SpendingLayout'
import { SpendingOverview } from '@/modules/spending/SpendingOverview'
import { TransactionsPage } from '@/modules/spending/TransactionsPage'
import { BudgetsPage } from '@/modules/spending/BudgetsPage'
import { RecurringPage } from '@/modules/spending/RecurringPage'
import { ReportsPage } from '@/modules/spending/ReportsPage'
import { CategoriesPage } from '@/modules/spending/CategoriesPage'
import { WealthLayout } from '@/modules/wealth/WealthLayout'
import { WealthOverview } from '@/modules/wealth/WealthOverview'
import { HoldingsPage } from '@/modules/wealth/HoldingsPage'
import { HoldingDetailPage } from '@/modules/wealth/HoldingDetailPage'
import { ContributionsPage } from '@/modules/wealth/ContributionsPage'
import { WealthImportPage } from '@/modules/wealth/WealthImportPage'
import { EventsPage } from '@/modules/events/EventsPage'
import { CalendarSyncPage } from '@/modules/events/CalendarSyncPage'
import { SettingsPage } from '@/modules/settings/SettingsPage'
import { EmptyState } from '@/components/ui/display'
import { Button, ButtonLink } from '@/components/ui/Button'

function Providers() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppProvider>
          <QuickAddProvider>
            <Outlet />
          </QuickAddProvider>
        </AppProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}

function RouteError() {
  const err = useRouteError() as Error | undefined
  return (
    <div className="mx-auto max-w-lg py-20">
      <EmptyState
        title="Something went wrong on this page"
        description={err?.message ?? 'Unknown error'}
        action={
          <div className="flex gap-2">
            <Button onClick={() => location.reload()}>Reload</Button>
            <ButtonLink to="/" variant="primary">
              Go to overview
            </ButtonLink>
          </div>
        }
      />
      <p className="mt-4 text-center text-xs text-muted">Your data is safe in local storage.</p>
    </div>
  )
}

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="That page doesn't exist."
      action={
        <ButtonLink to="/" variant="primary">
          Back to overview
        </ButtonLink>
      }
    />
  )
}

const router = createBrowserRouter([
  {
    element: <Providers />,
    errorElement: <RouteError />,
    children: [
      {
        element: <Layout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'learning', element: <LearningHubPage /> },
          { path: 'trackers', element: <TrackersListPage /> },
          { path: 'trackers/new', element: <TrackerBuilderPage /> },
          { path: 'trackers/:id/edit', element: <TrackerBuilderPage /> },
          { path: 'trackers/:id', element: <TrackerPage /> },
          {
            path: 'spending',
            element: <SpendingLayout />,
            children: [
              { index: true, element: <SpendingOverview /> },
              { path: 'transactions', element: <TransactionsPage /> },
              { path: 'budgets', element: <BudgetsPage /> },
              { path: 'recurring', element: <RecurringPage /> },
              { path: 'reports', element: <ReportsPage /> },
              { path: 'categories', element: <CategoriesPage /> },
            ],
          },
          {
            path: 'wealth',
            element: <WealthLayout />,
            children: [
              { index: true, element: <WealthOverview /> },
              { path: 'holdings', element: <HoldingsPage /> },
              { path: 'holdings/:id', element: <HoldingDetailPage /> },
              { path: 'contributions', element: <ContributionsPage /> },
              { path: 'import', element: <WealthImportPage /> },
            ],
          },
          { path: 'events', element: <EventsPage /> },
          { path: 'events/sync', element: <CalendarSyncPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'home', element: <Navigate to="/" replace /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
