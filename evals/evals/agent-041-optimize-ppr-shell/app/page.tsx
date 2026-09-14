import { RevenueChart } from './RevenueChart'
import { LatestInvoices } from './LatestInvoices'
import { CardStats } from './CardStats'

async function getDashboardData() {
  const res = await fetch('https://api.example.com/dashboard')
  return res.json()
}

export default async function Page() {
  const data = await getDashboardData()

  return (
    <main>
      <h1>Dashboard</h1>
      <CardStats
        totalRevenue={data.totalRevenue}
        totalInvoices={data.totalInvoices}
      />
      <RevenueChart revenue={data.revenue} />
      <LatestInvoices invoices={data.invoices} />
    </main>
  )
}
