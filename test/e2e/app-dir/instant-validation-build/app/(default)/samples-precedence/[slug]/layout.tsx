import type { Instant } from 'next'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [
    {
      params: {
        slug: 'from-layout',
      },
    },
  ],
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
