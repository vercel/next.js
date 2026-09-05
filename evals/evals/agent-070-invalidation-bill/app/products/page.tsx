import { Suspense } from 'react'
import Link from 'next/link'
import { getProducts } from '@/lib/queries'

async function Catalog() {
  const products = await getProducts()
  return (
    <ul>
      {products.map((p) => (
        <li key={p.slug}>
          <Link href={`/products/${p.slug}`}>{p.name}</Link> — ${p.price}
        </li>
      ))}
    </ul>
  )
}

export default function ProductsPage() {
  return (
    <main>
      <h1>Catalog</h1>
      <Suspense fallback={<p>Loading catalog…</p>}>
        <Catalog />
      </Suspense>
    </main>
  )
}
