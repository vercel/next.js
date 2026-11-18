'use client'

import { lazy, Suspense } from 'react'

const A = lazy(() => import('../../lib/a'))
const B = lazy(() => import('../../lib/b'))
const C = lazy(() => import('../../lib/c'))

export default function Page() {
  return (
    <main>
      <p id="page">page-1</p>
      <Suspense fallback={null}>
        <A />
        <B />
        <C />
      </Suspense>
    </main>
  )
}
