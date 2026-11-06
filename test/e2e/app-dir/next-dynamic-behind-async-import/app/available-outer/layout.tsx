import type { ReactNode } from 'react'
import StaticOuter from '../../ui/static-outer'

// The layout chunks `./outer` (and so creates the async loader of `./with-dynamic`), so the page's
// async loader of `./outer` loads nothing.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <StaticOuter />
      {children}
    </>
  )
}
