import { getInvoices, summarize } from '@/lib/invoices'
import { getSession } from '@/lib/session'

export default async function OverviewPage() {
  const session = await getSession()
  if (!session) return null

  const invoices = await getInvoices(session.teamId)
  const totals = summarize(invoices)

  return (
    <>
      <h1>Overview</h1>
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
