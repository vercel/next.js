import type { ReactNode } from 'react'

/**
 * The explicit default declares coverage for the implicit children slot, so
 * the named catch-all produces a complete broad matcher that must be retained.
 */
export default function ChildrenDefaultLayout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <div id="children-default-layout">
      {children}
      {slot}
    </div>
  )
}
