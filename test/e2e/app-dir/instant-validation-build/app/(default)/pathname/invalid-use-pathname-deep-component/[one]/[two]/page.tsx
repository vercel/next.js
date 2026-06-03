import type { Instant } from 'next'
import { OuterWrapper } from './outer-wrapper'

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
        usePathname() called from a Client Component nested three wrapper
        components deep on a route with dynamic params where not all params are
        provided in the sample. The build-time validation error should still
        point at the actual call site in the user's source, not at a generic{' '}
        <code>{'<unknown>'}</code> frame.
      </p>
      <OuterWrapper />
    </main>
  )
}
