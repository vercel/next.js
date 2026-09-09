import { Suspense } from 'react'
import { getFreshQuote } from '../../lib/quote'

async function Ticker() {
  const quote = await getFreshQuote()
  return (
    <div>
      <span data-testid="live-symbol">{quote.symbol}</span>{' '}
      <span data-testid="live-price">{quote.price.toFixed(2)}</span>{' '}
      <span data-testid="live-stamp">{quote.stamp}</span>
    </div>
  )
}

export default function LivePage() {
  return (
    <main>
      <h1>Live ticker</h1>
      <Suspense
        fallback={<p data-testid="live-fallback">Fetching live quote…</p>}
      >
        <Ticker />
      </Suspense>
    </main>
  )
}
