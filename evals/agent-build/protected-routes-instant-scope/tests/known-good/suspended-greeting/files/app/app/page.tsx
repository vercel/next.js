import { Suspense } from 'react'
import { getInvoices, summarize } from '@/lib/invoices'
import { getCurrentSession } from '@/lib/session'

export default function OverviewPage() {
  return (
    <>
      <h1>Overview</h1>
      <Suspense fallback={<p data-testid="greeting">Welcome back…</p>}>
        <OverviewGreeting />
      </Suspense>
      <Suspense fallback={<dl />}>
        <OverviewTotals />
      </Suspense>
    </>
  )
}

async function OverviewGreeting() {
  const session = await getCurrentSession()
  return <p data-testid="greeting">Welcome back, {session.name}.</p>
}

async function OverviewTotals() {
  const session = await getCurrentSession()
  const invoices = await getInvoices(session.teamId)
  const totals = summarize(invoices)

  return (
    <dl>
      <dt>Outstanding</dt>
      <dd data-testid="outstanding">${totals.outstanding}</dd>
      <dt>Overdue invoices</dt>
      <dd data-testid="overdue">{totals.overdue}</dd>
    </dl>
  )
}
