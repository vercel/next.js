import { Instant } from 'next'
import { ReactNode } from 'react'
import { HackilyPreventFullyStaticServerPrerender } from '../../../shared'

// We need a layout to export an instant config. Client components cannot have one
export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ searchParams: { query: 'foo' } }],
}

export default function DummyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HackilyPreventFullyStaticServerPrerender />
      {children}
    </>
  )
}
