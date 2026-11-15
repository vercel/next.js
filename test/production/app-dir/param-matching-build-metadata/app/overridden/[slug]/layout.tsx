import type { ReactNode } from 'react'

export const unstable_paramMatching = { slug: 'fallback' } as const

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
