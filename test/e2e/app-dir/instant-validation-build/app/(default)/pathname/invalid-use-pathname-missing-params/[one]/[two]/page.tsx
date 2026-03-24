import type { Instant } from 'next'
import { PathnameReader } from './pathname-reader'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
    {
      params: {
        one: '123',
        // two: <missing>
      },
    },
  ],
}

export default function Page() {
  return (
    <main>
      <p>
        usePathname() on a route with dynamic params where not all params are
        provided in the sample should fail validation.
      </p>
      <PathnameReader />
    </main>
  )
}
