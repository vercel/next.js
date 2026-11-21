// The dynamic holes of the Cache Components configuration (BENCH_CC=1).
// Each component reads request data or short-lived data, so it cannot be
// prerendered: render it inside <Suspense>. The default configuration leaves
// them out (`HOLES` is false there), because they would make the whole page
// dynamic.
import { cookies } from 'next/headers'
import { getStock } from '@bench/data'

export const HOLES = process.env.BENCH_CC === '1'

// Reads cookies.
export async function MemberOffer({ productId, price, currency }) {
  const jar = await cookies()
  const name = jar.get('bench-member')?.value
  const memberPrice = (price * 0.9).toFixed(2)
  return (
    <aside className="member-offer" data-product={productId}>
      {name ? (
        <p>
          Welcome back, {name}. Your member price is {currency} {memberPrice}.
        </p>
      ) : (
        <p>
          Sign in for the member price of {currency} {memberPrice}.
        </p>
      )}
    </aside>
  )
}

// Reads a cache entry that is too short-lived to prerender.
export async function StockStatus({ productId }) {
  const stock = await getStock(productId)
  return (
    <p className="stock-live" data-product={stock.id}>
      {stock.available > 0
        ? `${stock.available} in stock at ${stock.warehouse}, ships in ${stock.shipsInDays} days`
        : `Sold out at ${stock.warehouse}`}
    </p>
  )
}

// Reads the search params of the request.
export async function SortNote({ searchParams }) {
  const query = await searchParams
  return (
    <p className="sort-note">
      Sorted by {String(query.sort || 'featured')}
      {query.brand ? `, filtered by brand ${String(query.brand)}` : ''}
    </p>
  )
}

export function HoleSkeleton({ label }) {
  return (
    <p className="skeleton" aria-busy="true">
      {label}
    </p>
  )
}
