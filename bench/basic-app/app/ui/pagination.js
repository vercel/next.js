'use client'
import { describeUtils } from './vendor-util'
import { useState } from 'react'
export default function Pagination({ pages, initial = 1 }) {
  const [page, setPage] = useState(initial)
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </nav>
  )
}

export const __layers = [describeUtils].length
