import { Suspense } from 'react'
import { getProducts } from '../../lib/products'

async function ProductList() {
  const products = await getProducts()
  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>
          {p.name} — ${p.price}
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
        <ProductList />
      </Suspense>
    </main>
  )
}
