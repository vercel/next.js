import type { ReactNode } from 'react'

/**
 * Both top-level slots have catch-all coverage, but @outer contains another
 * parallel level that is incomplete for the broad matcher. Pruning must find
 * that nested synthesized default; only /specific has a complete tree.
 */
export default function NestedParallelLayout({
  children,
  outer,
}: {
  children: ReactNode
  outer: ReactNode
}) {
  return (
    <div id="nested-parallel-layout">
      {children}
      {outer}
    </div>
  )
}
