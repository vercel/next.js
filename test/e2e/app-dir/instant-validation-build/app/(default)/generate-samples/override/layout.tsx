import type { Instant } from 'next'
import type { ReactNode } from 'react'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  generateSamples: async () => {
    throw new Error(
      'parent generateSamples should not run when a child defines its own samples'
    )
  },
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
