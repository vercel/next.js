// The dynamic holes. Each component reads request data or short-lived data,
// so it cannot be prerendered: render it inside <Suspense> with one of the
// fallbacks from ./skeletons.
import Link from 'next/link'
import { getStock } from '../lib/cms'
import { getSession } from '../lib/session'

// Reads cookies.
export async function MemberOffer({ productId, price }) {
  const session = await getSession()
  const memberPrice = (price * 0.9).toFixed(2)
  return (
    <aside className="member-offer" data-product={productId}>
      {session.name ? (
        <p>
          Welcome back, {session.name}. Your member price is {session.currency}{' '}
          {memberPrice}, and you have {session.cartLines} items in your cart.
        </p>
      ) : (
        <p>
          <Link href="/about">Sign in</Link> for the member price of{' '}
          {session.currency} {memberPrice}.
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

const SORTS = ['featured', 'price-asc', 'price-desc', 'rating']

// Reads the search params of the request.
export async function SortControls({ category, page, searchParams }) {
  const query = await searchParams
  const sort = SORTS.includes(query.sort) ? query.sort : 'featured'
  return (
    <nav className="sort" aria-label="Sort products">
      <ul>
        {SORTS.map((value) => (
          <li key={value}>
            <Link
              href={`/category/${category}/${page}?sort=${value}`}
              aria-current={value === sort ? 'true' : undefined}
            >
              {value}
            </Link>
          </li>
        ))}
      </ul>
      {query.brand ? <p>Filtered by brand: {String(query.brand)}</p> : null}
    </nav>
  )
}
