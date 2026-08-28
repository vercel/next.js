import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function CartPage() {
  const store = await cookies()
  const raw = store.get('cart')?.value ?? ''
  const slugs = raw.split(',').filter(Boolean)
  return (
    <main>
      <h1 data-testid="cart-heading">Your cart</h1>
      {slugs.length === 0 ? (
        <p data-testid="cart-empty">Your cart is empty.</p>
      ) : (
        <ul data-testid="cart-list">
          {slugs.map((slug) => (
            <li key={slug} data-testid={'cart-item-' + slug}>
              {slug}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
