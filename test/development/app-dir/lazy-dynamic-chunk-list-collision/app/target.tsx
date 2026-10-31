'use client'

import { lazy, Suspense } from 'react'

const Leaf = lazy(() => import('./leaf'))

export default function Target() {
  return (
    <Suspense fallback="Loading">
      <Leaf />
    </Suspense>
  )
}
