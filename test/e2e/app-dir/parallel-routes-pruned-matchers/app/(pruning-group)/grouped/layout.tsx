import type { ReactNode } from 'react'

/**
 * The route group must not affect completeness. The broad children catch-all
 * lacks @slot coverage and is pruned, while /grouped/specific has both pages
 * and remains in the matcher set.
 */
export default function GroupedLayout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <div id="grouped-layout">
      {children}
      {slot}
    </div>
  )
}
