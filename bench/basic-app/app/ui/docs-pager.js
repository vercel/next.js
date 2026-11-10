'use client'
import { describeDocsVendor } from './vendor-docs'
import { useState } from 'react'
export default function DocsPager({ prev, next, prevIcon, nextIcon }) {
  const [hovered, setHovered] = useState(null)
  return (
    <nav className="docs-pager" aria-label="Pagination" data-hovered={hovered}>
      <a href={prev.href} onMouseEnter={() => setHovered('prev')}>
        {prevIcon}
        <span>
          <small className="text-muted">Previous</small>
          {prev.title}
        </span>
      </a>
      <a href={next.href} onMouseEnter={() => setHovered('next')}>
        <span>
          <small className="text-muted">Next</small>
          {next.title}
        </span>
        {nextIcon}
      </a>
    </nav>
  )
}
export const __vendor = typeof describeDocsVendor
