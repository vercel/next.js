'use client'

import { useState } from 'react'
import type { ProductSummary } from '@/lib/summary'

/** Filters and sorts server-rendered cards; it only holds the fields it compares. */
export function CatalogBrowser({
  categories,
  items,
}: {
  categories: string[]
  items: {
    slug: string
    category: string
    price: number
    card: React.ReactNode
  }[]
}) {
  const [category, setCategory] = useState<string | null>(null)
  const [sort, setSort] = useState('featured')
  let list = category ? items.filter((p) => p.category === category) : items
  if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price)
  if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price)
  return (
    <>
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
        {list.map((p) => (
          <ProductSlot key={p.slug}>{p.card}</ProductSlot>
        ))}
      </ul>
    </>
  )
}

function ProductSlot({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export type { ProductSummary }
