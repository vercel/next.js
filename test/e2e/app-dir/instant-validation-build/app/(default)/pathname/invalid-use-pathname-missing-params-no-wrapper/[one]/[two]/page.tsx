import type { Instant } from 'next'
import { PathnameReader } from './pathname-reader'

export const unstable_instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [
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
        usePathname() called directly at the top of a Client Component body (no{' '}
        <code>ensureThrows()</code> wrapper) on a route with dynamic params
        where not all params are provided in the sample. The build-time
        validation error should point at the call site in the user's source.
      </p>
      <PathnameReader />
    </main>
  )
}
