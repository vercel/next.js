import Link from 'next/link'
import { getProducts } from '@/lib/catalog'

export const revalidate = 3600

export default async function CatalogPage() {
  const products = await getProducts()

  return (
    <main>
      <h1>Northstar Supply</h1>
      <p>Catalog checked at {new Date().toLocaleTimeString('en-US')}.</p>
      <ul>
        {products.map((product) => (
          <li key={product.slug}>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
