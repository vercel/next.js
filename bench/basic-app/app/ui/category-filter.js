'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function CategoryFilter({ categories, icon }) {
  const [selected, setSelected] = useState('all')
  return (
    <div className="category-filter flex items-center gap-2" role="group">
      {icon}
      <button
        type="button"
        aria-pressed={selected === 'all'}
        onClick={() => setSelected('all')}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.slug}
          type="button"
          aria-pressed={selected === c.slug}
          onClick={() => setSelected(c.slug)}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
export const __vendor = typeof describeBlogVendor
