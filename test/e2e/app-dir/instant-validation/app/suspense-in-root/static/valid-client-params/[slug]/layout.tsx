import { Instant } from 'next'
import { ReactNode } from 'react'

// We need a layout to export an instant config. Client components cannot have one
export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: '123' } }],
}

export default function DummyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
