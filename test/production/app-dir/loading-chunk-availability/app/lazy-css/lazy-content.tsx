'use client'

import { lazy, Suspense } from 'react'

const LazyPanel = lazy(() => import('./lazy-panel'))

export function LazyContent() {
  return (
    <Suspense fallback={null}>
      <LazyPanel />
    </Suspense>
  )
}
