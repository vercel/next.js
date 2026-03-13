import type { Instant } from 'next'
import { Suspense } from 'react'
import { PathnameReader } from './pathname-reader'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
    {
      params: {
        catchAll: ['aaa', 'bbb', 'ccc'],
      },
    },
  ],
}

export default function Page() {
  return (
    <main>
      <p>
        usePathname() on a catch-all route should return the pathname with the
        sample array items joined by slashes.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <PathnameReader />
      </Suspense>
    </main>
  )
}
