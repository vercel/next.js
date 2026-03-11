import type { Instant } from 'next'
import { Suspense } from 'react'
import { PathnameReader } from './pathname-reader'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
    {
      params: {
        one: '123',
        two: '456',
      },
    },
  ],
}

export default function Page() {
  return (
    <main>
      <p>
        usePathname() on a route with dynamic params should return the pathname
        with the sample param values substituted.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <PathnameReader />
      </Suspense>
    </main>
  )
}
