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
        usePathname() without an ensureThrows wrapper should point at the call
        site in the user&apos;s source.
      </p>
      <PathnameReader />
    </main>
  )
}
