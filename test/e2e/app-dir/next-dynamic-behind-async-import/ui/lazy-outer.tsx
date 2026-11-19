'use client'

import { lazy, Suspense } from 'react'

// Two plain import()s on the way to the next/dynamic imports.
const Outer = lazy(() => import('./outer'))

export default function LazyOuter() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Outer />
    </Suspense>
  )
}
