import type { Instant } from 'next'
import { Suspense } from 'react'
import { PathnameReader } from './pathname-reader'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
    {
      params: {
        optionalCatchAll: ['xxx', 'yyy'],
      },
    },
  ],
}

export default function Page() {
  return (
    <main>
      <p>
        usePathname() on an optional catch-all route should return the pathname
        with the sample array items joined by slashes.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <PathnameReader />
      </Suspense>
    </main>
  )
}
