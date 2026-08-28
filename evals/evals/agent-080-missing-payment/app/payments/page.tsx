import Link from 'next/link'
import { connection } from 'next/server'
import { readPayments } from '../../lib/payments-core'

export default async function PaymentsPage() {
  await connection()
  const payments = readPayments()
  return (
    <main>
      <h1>Payments</h1>
      <p data-testid="payment-count">
        {payments.length} payment{payments.length === 1 ? '' : 's'} recorded
      </p>
      <ul data-testid="payments-list">
        {payments.map((p) => (
          <li key={p.id} data-testid="payment-row">
            {p.invoiceId} — ${p.amount.toFixed(2)}
          </li>
        ))}
      </ul>
      <p>
        <Link href="/">Back to invoices</Link>
      </p>
    </main>
  )
}
