import type { ReactNode } from 'react'

/**
 * Both children and @slot cover the same catch-all, so the broad matcher can
 * construct a complete loader tree and must be retained when pruning is on.
 */
export default function CompleteCatchallsLayout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <div id="complete-catchalls-layout">
      {children}
      {slot}
    </div>
  )
}
