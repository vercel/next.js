import { RevenueChart } from './RevenueChart'
import { LatestInvoices } from './LatestInvoices'
import { CardStats } from './CardStats'
import { getCardStats, getRevenue, getInvoices } from './data'

export default async function Page() {
  const [cards, revenue, invoices] = await Promise.all([
    getCardStats(),
    getRevenue(),
    getInvoices(),
  ])

  return (
    <main>
      <h1>Dashboard</h1>
      <CardStats {...cards} />
      <RevenueChart revenue={revenue} />
      <LatestInvoices invoices={invoices} />
    </main>
  )
}
