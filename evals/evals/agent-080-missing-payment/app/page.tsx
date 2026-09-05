import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Link from 'next/link'

interface Invoice {
  id: string
  customer: string
  total: number
  issuedOn: string
}

export default function Home() {
  const { invoices } = JSON.parse(
    readFileSync(join(process.cwd(), 'data', 'invoices.json'), 'utf8')
  ) as { invoices: Invoice[] }
  return (
    <main>
      <h1>Billing dashboard</h1>
      <ul>
        {invoices.map((inv) => (
          <li key={inv.id}>
            <Link href={`/invoices/${inv.id}`}>
              {inv.id} — {inv.customer} — ${inv.total.toFixed(2)}
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/payments">Payments</Link>
      </p>
    </main>
  )
}
