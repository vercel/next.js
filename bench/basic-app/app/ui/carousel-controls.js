'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function CarouselControls({ pages, label }) {
  const [page, setPage] = useState(0)
  return (
    <span className="carousel-controls" aria-label={label}>
      <button
        type="button"
        aria-label="Previous"
        disabled={page === 0}
        onClick={() => setPage((p) => Math.max(0, p - 1))}
      >
        ←
      </button>
      <span className="text-xs text-muted">
        {page + 1} / {pages}
      </span>
      <button
        type="button"
        aria-label="Next"
        disabled={page === pages - 1}
        onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
      >
        →
      </button>
    </span>
  )
}
export const __vendor = typeof describeBlogVendor
