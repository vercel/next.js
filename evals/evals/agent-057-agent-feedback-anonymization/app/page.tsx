import { SummaryCard } from '@/components/dashboard'
import { dashboardCopy } from '@/lib/dashboard-copy'

export default function DashboardPage() {
  return (
    <main>
      <h1>{dashboardCopy.dashboardTitle}</h1>
      <SummaryCard />
    </main>
  )
}
