import type { ReactNode } from 'react'

// The page blocks on its data. It can't opt out of instant validation itself,
// because it sets a dynamic stale time.
export const instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
