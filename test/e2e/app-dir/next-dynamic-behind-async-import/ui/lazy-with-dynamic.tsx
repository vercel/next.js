'use client'

import { lazy, Suspense } from 'react'

// A plain import() of a module that contains next/dynamic imports: their async loaders are
// chunked with the async chunk group of `./with-dynamic`, not with this module's chunk group.
const WithDynamic = lazy(() => import('./with-dynamic'))

export default function LazyWithDynamic() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <WithDynamic />
    </Suspense>
  )
}
