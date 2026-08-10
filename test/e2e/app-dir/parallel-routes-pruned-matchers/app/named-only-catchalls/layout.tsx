import type { ReactNode } from 'react'

/**
 * Both named slots cover the catch-all and this layout intentionally has no
 * children slot. The broad matcher is complete and must not be pruned because
 * of the synthesized, but unused, children fallback.
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
