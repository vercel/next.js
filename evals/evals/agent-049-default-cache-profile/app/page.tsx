import { Suspense } from 'react'
import { getDeals, getInventory, getRates } from '../lib/data'

async function Board() {
  const [deals, inventory, rates] = await Promise.all([
    getDeals(),
    getInventory(),
    getRates(),
  ])
  return (
    <ul>
      {deals.map((d) => (
        <li key={d.sku}>
          {d.sku}: ${d.price} — stock {inventory[d.sku as 'A1' | 'B2']} — EUR{' '}
          {(d.price * rates.eur).toFixed(2)}
        </li>
      ))}
    </ul>
  )
}

export default function Home() {
  return (
    <main>
      <h1>Deals</h1>
      <Suspense fallback={<p>Loading deals…</p>}>
        <Board />
      </Suspense>
    </main>
  )
}
