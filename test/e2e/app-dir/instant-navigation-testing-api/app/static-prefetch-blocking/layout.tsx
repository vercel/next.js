import type { ReactNode } from 'react'

export const unstable_instant = { prefetch: 'static' as const }

export default function StaticPrefetchBlockingLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
