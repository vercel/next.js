import { Suspense } from 'react'
import { loadSession } from '@/lib/session'
import { getOrgInsights } from '@/lib/insights'
import { Greeting } from './greeting'

export default function OverviewPage() {
  return (
    <main>
      <h1>Usage overview</h1>
      <Suspense fallback={<p>Loading usage…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  )
}

function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

async function Dashboard() {
  await loadSession()
  const insights = await getOrgInsights('overview')
  return (
    <section>
      <h2>Organization: {insights.company}</h2>
      <p data-testid="usage">
        {formatCount(insights.events30d)} events in the last 30 days across{' '}
        {insights.activeSeats} seats
      </p>
      <Greeting />
    </section>
  )
}
