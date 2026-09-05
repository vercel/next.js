import { cacheLife } from 'next/cache'
import { getFreshQuote } from '../../lib/quote'

async function getDailyReport() {
  'use cache'
  cacheLife({ revalidate: 600 })
  const quote = await getFreshQuote()
  return quote
}

export default async function ReportPage() {
  const report = await getDailyReport()
  return (
    <main>
      <h1>Daily report</h1>
      <p>
        <span data-testid="report-symbol">{report.symbol}</span>{' '}
        <span data-testid="report-price">{report.price.toFixed(2)}</span>{' '}
        <span data-testid="report-stamp">{report.stamp}</span>
      </p>
    </main>
  )
}
