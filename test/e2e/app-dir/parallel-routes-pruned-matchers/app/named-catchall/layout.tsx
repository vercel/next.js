import type { ReactNode } from 'react'

/**
 * The named slots provide a catch-all and a /foo page, but there is no
 * `children` page or default. Every candidate would synthesize the children
 * not-found default, so this route emits no matchers when pruning is enabled.
 */
export default function NamedCatchallLayout({
  children,
  catchall,
  specific,
}: {
  children: ReactNode
  catchall: ReactNode
  specific: ReactNode
}) {
  return (
    <div id="named-catchall-layout">
      {children}
      {catchall}
      {specific}
    </div>
  )
}
