import { lazy, Suspense } from 'react'

// A second plain import() on the way to the next/dynamic imports.
const WithDynamic = lazy(() => import('./with-dynamic'))

export default function Outer() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <WithDynamic />
    </Suspense>
  )
}
