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
        usePathname() nested three wrappers deep should still point at the
        actual call site.
      </p>
      <OuterWrapper />
    </main>
  )
}
