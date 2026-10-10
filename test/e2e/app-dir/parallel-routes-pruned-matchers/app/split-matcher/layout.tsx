import type { ReactNode } from 'react'

/**
 * The @slot catch-all is combined with the concrete children pages for /foo
 * and /bar, so those complete matchers remain. Its standalone broad matcher
 * has no children page or default and is pruned.
 */
export default function SplitMatcherLayout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <div id="split-matcher-layout">
      {children}
      {slot}
    </div>
  )
}
