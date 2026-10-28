'use client'

import { useState } from 'react'

/** Reveals reviews the server already rendered. */
export function MoreReviews({
  total,
  children,
}: {
  total: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (open) return <>{children}</>
  return (
    <button type="button" onClick={() => setOpen(true)}>
      Show all {total} reviews
    </button>
  )
}
