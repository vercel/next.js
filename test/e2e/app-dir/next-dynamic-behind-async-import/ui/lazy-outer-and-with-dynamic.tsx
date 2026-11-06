'use client'

import { lazy, Suspense } from 'react'

// This module's chunk group creates the async loaders of both `./outer` and `./with-dynamic`.
// `./outer`'s async chunk group sees the loader of `./with-dynamic` as available and doesn't
// create its own, so on the path through `./outer` the loader is chunked further up.
const Outer = lazy(() => import('./outer'))
const WithDynamic = lazy(() => import('./with-dynamic'))

export default function LazyOuterAndWithDynamic() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Outer />
      <WithDynamic />
    </Suspense>
  )
}
