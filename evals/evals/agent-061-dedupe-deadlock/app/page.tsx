import { Suspense } from 'react'
import { getDeals, preloadDeals } from '../lib/deals'

async function DealsList() {
  const deals = await getDeals()
  return (
    <ul>
      {deals.map((deal) => (
        <li key={deal.sku}>
          {deal.sku}: ${deal.price}
        </li>
      ))}
    </ul>
  )
}

export default function Home() {
  preloadDeals()
  return (
    <main>
      <h1>Today's deals</h1>
      <Suspense fallback={<p>Loading deals…</p>}>
        <DealsList />
      </Suspense>
    </main>
  )
}
