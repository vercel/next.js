import Link from 'next/link'
import { Suspense } from 'react'
import { getInvoices, type InvoiceStatus } from '@/lib/invoices'
import { getCurrentSession } from '@/lib/session'

const statuses: InvoiceStatus[] = ['open', 'paid', 'overdue']

export default function InvoicesPage({
  searchParams,
}: PageProps<'/app/invoices'>) {
  return (
    <>
      <h1>Invoices</h1>
      <nav aria-label="Filter">
        <Link href="/app/invoices">All</Link>
        {statuses.map((candidate) => (
          <span key={candidate}>
            {' · '}
            <Link href={`/app/invoices?status=${candidate}`} prefetch>
              {candidate}
            </Link>
          </span>
        ))}
      </nav>
      <Suspense fallback={<table />}>
        <InvoiceTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function InvoiceTable({
  searchParams,
}: {
  searchParams: PageProps<'/app/invoices'>['searchParams']
}) {
  const { status } = await searchParams
  const session = await getCurrentSession()
  const invoices = await getInvoices(session.teamId)
  const filter = statuses.find((candidate) => candidate === status)
  const visible = filter
    ? invoices.filter((invoice) => invoice.status === filter)
    : invoices

  return (
    <table>
      <tbody>
        {visible.map((invoice) => (
          <tr
            key={invoice.id}
            data-invoice={invoice.id}
            data-status={invoice.status}
          >
            <td>{invoice.id}</td>
            <td>{invoice.customer}</td>
            <td>${invoice.amount}</td>
            <td>{invoice.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
