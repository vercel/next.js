import type { ReactNode } from 'react'

/**
 * This is the retained control case. @slot/default covers the broad children
 * catch-all, and @slot/special covers the concrete /special matcher, so both
 * matcher shapes can construct a complete loader tree.
 */
export default function ValidLayout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <div id="valid-layout">
      {children}
      {slot}
    </div>
  )
}
