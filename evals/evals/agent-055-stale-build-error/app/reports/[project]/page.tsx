import { loadSummaryCard } from '@/components/dashboard/load-card'
import { dashboardCopy } from '@/lib/dashboard-copy'
import { defineStaticParams } from '@/lib/route-params'

export const generateStaticParams = defineStaticParams('project', ['acme'])

export default async function ReportsPage() {
  const SummaryCard = await loadSummaryCard()

  return (
    <main>
      <h1>{dashboardCopy.reportsTitle}</h1>
      <SummaryCard />
    </main>
  )
}
