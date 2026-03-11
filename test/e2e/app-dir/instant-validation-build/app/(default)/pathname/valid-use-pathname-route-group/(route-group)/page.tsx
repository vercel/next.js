import type { Instant } from 'next'
import { Suspense } from 'react'
import { PathnameReader } from './pathname-reader'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [{}],
}

export default function Page() {
  return (
    <main>
      <p>
        usePathname() on a route inside a route group should not contain the
        route group segment in the pathname.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <PathnameReader />
      </Suspense>
    </main>
  )
}
