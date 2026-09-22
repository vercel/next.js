import { listInvoices } from '@/lib/billing/invoices'
import { formatMoney } from '@/lib/format-money'

export default async function Page() {
  const invoices = await listInvoices()

  return (
    <main>
      <h1>Invoices</h1>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.number}>
            {invoice.number}: {formatMoney(invoice.amountCents)} —{' '}
            {invoice.status}
          </li>
        ))}
      </ul>
    </main>
  )
}
