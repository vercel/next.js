import type { ReactNode } from 'react'

/**
 * Both named slots cover the catch-all and this layout intentionally has no
 * children slot. The broad matcher is complete, and strict matching represents
 * this level using only the declared left and right slots.
 */
export default function NamedOnlyCatchallsLayout({
  left,
  right,
}: {
  left: ReactNode
  right: ReactNode
}) {
  return (
    <div id="named-only-catchalls-layout">
      {left}
      {right}
    </div>
  )
}
