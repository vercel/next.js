import { lazy, Suspense } from 'react'

const Foo = lazy(() => import('../components/foo.client'))

export default function Page() {
  return (
    <div>
      <Suspense fallback="loading...">
        <Foo />
      </Suspense>
    </div>
  )
}
