import type { Metadata } from 'next'
import { loadReport, loadReportMetadata } from '@/lib/reports'

export async function generateMetadata(): Promise<Metadata> {
  const metadata = await loadReportMetadata()
  return { title: metadata.title }
}

export default async function ReportsPage() {
  const report = await loadReport()

  return (
    <main>
      <h1>{report.title}</h1>
      <p>{report.summary}</p>
    </main>
  )
}
