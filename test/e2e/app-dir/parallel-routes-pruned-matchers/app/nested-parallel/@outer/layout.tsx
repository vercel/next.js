import type { ReactNode } from 'react'

/**
 * @inner only has a /specific page. The outer children catch-all therefore
 * makes every other URL incomplete at this nested parallel-route level.
 */
export default function NestedOuterLayout({
  children,
  inner,
}: {
  children: ReactNode
  inner: ReactNode
}) {
  return (
    <div id="nested-outer-layout">
      {children}
      {inner}
    </div>
  )
}
