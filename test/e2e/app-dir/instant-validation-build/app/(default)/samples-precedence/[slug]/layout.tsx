import type { Instant } from 'next'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
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
