import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RecordPaymentForm } from './record-payment-form'

interface Invoice {
  id: string
  customer: string
  total: number
  issuedOn: string
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { invoices } = JSON.parse(
    readFileSync(join(process.cwd(), 'data', 'invoices.json'), 'utf8')
  ) as { invoices: Invoice[] }
  const invoice = invoices.find((inv) => inv.id === id)
  if (!invoice) notFound()
  return (
    <main>
      <h1>Invoice {invoice.id}</h1>
      <p>
        {invoice.customer} — ${invoice.total.toFixed(2)} — issued{' '}
        {invoice.issuedOn}
      </p>
      <RecordPaymentForm invoiceId={invoice.id} />
      <p>
        <Link href="/payments" data-testid="view-payments-link">
          View payments list
        </Link>
      </p>
    </main>
  )
}
