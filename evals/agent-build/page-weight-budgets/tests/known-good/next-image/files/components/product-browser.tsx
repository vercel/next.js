'use client'

import { useState } from 'react'
import { ProductCard } from '@/components/product-card'
import type { CardProduct } from '@/lib/catalog'

export function ProductBrowser({
  products,
  categories,
}: {
  products: CardProduct[]
  categories: string[]
}) {
  const [category, setCategory] = useState<string | null>(null)
  const [sort, setSort] = useState('featured')
  let list = category
    ? products.filter((p) => p.category === category)
    : products
  if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price)
  if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price)
  return (
    <main>
      <h1>All gear</h1>
      <div className="filters" role="group" aria-label="Category">
        <button
          type="button"
          aria-pressed={category === null}
          onClick={() => setCategory(null)}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <label>
        Sort{' '}
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="featured">Featured</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </label>
      <ul className="grid" aria-label="Products">
        {list.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </ul>
    </main>
  )
}
