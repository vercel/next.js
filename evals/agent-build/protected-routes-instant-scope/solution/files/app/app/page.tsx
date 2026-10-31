import { Suspense } from 'react'
import { getInvoices, summarize } from '@/lib/invoices'
import { requireSession } from '@/lib/session'

export default function OverviewPage() {
  return (
    <>
      <h1>Overview</h1>
      <Suspense
        fallback={<p data-testid="overview-loading">Loading your overview…</p>}
      >
        <Overview />
      </Suspense>
    </>
  )
}

async function Overview() {
  const session = await requireSession()
  const invoices = await getInvoices(session.teamId)
  const totals = summarize(invoices)

  return (
    <>
      <p data-testid="greeting">Welcome back, {session.name}.</p>
      <dl>
        <dt>Outstanding</dt>
        <dd data-testid="outstanding">${totals.outstanding}</dd>
        <dt>Overdue invoices</dt>
        <dd data-testid="overdue">{totals.overdue}</dd>
      </dl>
    </>
  )
}
