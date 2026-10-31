'use client'

import { useState } from 'react'
import type { Review } from '@/lib/catalog'

export function Reviews({ reviews }: { reviews: Review[] }) {
  const [allReviews, setAllReviews] = useState(false)
  const shown = allReviews ? reviews : reviews.slice(0, 3)
  return (
    <section aria-label="Reviews">
      <h2>Reviews</h2>
      <ul>
        {shown.map((r) => (
          <li key={r.id}>
            <strong>{r.title}</strong> · {r.author}, {r.date}
            <p>{r.body}</p>
          </li>
        ))}
      </ul>
      {!allReviews ? (
        <button type="button" onClick={() => setAllReviews(true)}>
          Show all {reviews.length} reviews
        </button>
      ) : null}
    </section>
  )
}
