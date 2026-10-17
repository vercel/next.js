import type { ReactNode } from 'react'

// Deliberately no `as const`: object-property values naturally widen to string.
export const unstable_paramMatching = { lang: 'blocking' }

export default function Layout({ children }: { children: ReactNode }) {
  return <section>{children}</section>
}
