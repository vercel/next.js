'use client'

import { Fragment, useState } from 'react'

// Cards are rendered on the server; this only filters and orders them.
export type BrowserItem = {
  slug: string
  category: string
  price: number
  card: React.ReactNode
}

export function ProductBrowser({
  items,
  categories,
}: {
  items: BrowserItem[]
  categories: string[]
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
        {list.map((item) => (
          <Fragment key={item.slug}>{item.card}</Fragment>
        ))}
      </ul>
    </>
  )
}
