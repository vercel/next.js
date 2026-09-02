import type { ReactNode } from 'react'

/**
 * `children` matches every non-empty path, but @first only matches /foo and
 * @second only matches /bar. Every candidate therefore synthesizes a
 * not-found default for at least one named slot, so this route emits no
 * matchers when pruning is enabled.
 */
export default function ChildrenCatchallLayout({
  children,
  first,
  second,
}: {
  children: ReactNode
  first: ReactNode
  second: ReactNode
}) {
  return (
    <div id="children-catchall-layout">
      {children}
      {first}
      {second}
    </div>
  )
}
