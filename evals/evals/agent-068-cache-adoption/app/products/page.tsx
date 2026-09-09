import Link from 'next/link'
import { getProducts } from '@/lib/queries'

export default async function ProductsPage() {
  const products = await getProducts()
  return (
    <main>
      <h1 data-testid="catalog-heading">Full Catalog</h1>
      <ul data-testid="catalog-list">
        {products.map((p) => (
          <li key={p.slug}>
            <Link href={'/products/' + p.slug}>{p.name}</Link> — ${p.price}
          </li>
        ))}
      </ul>
    </main>
  )
}
