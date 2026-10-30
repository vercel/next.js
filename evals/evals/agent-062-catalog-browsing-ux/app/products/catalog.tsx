'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Product } from '../../lib/products'

export default function Catalog() {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/products?${new URLSearchParams({ q, category })}`)
      .then((response) => response.json())
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [q, category])

  if (loading) return <p role="status">Loading products…</p>

  return (
    <>
      <h1>Products</h1>
      <form onSubmit={(event) => event.preventDefault()}>
        <label>
          Search products
          <input value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            <option value="bags">Bags</option>
            <option value="gear">Gear</option>
            <option value="clothing">Clothing</option>
          </select>
        </label>
      </form>
      <ul aria-label="Products">
        {products.map((product) => (
          <li key={product.slug}>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
            <p>${product.price}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
