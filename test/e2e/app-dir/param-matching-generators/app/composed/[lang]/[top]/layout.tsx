import type { ReactNode } from 'react'

// The page replaces lang before the effective route policy is validated.
export const unstable_paramMatching = {
  lang: 'fallback',
  top: 'blocking',
} as const

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
