import { headers } from 'next/headers'
import { getStats } from '../../lib/metrics'

async function StatsWidget() {
  await headers()
  const stats = await getStats()
  return (
    <section id="stats">
      <p>Active users: {stats.activeUsers}</p>
      <p>Revenue: {stats.revenue}</p>
    </section>
  )
}

export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <p id="uptime">All systems operational.</p>
      <StatsWidget />
    </main>
  )
}
