import type { ReactNode } from 'react'

/**
 * This layout intentionally has no children slot. /foo is retained because
 * both declared named slots match it, while the broader catch-all is pruned
 * because @specific has no matching page or default for other URLs. Strict
 * matching does not synthesize a children slot at this level.
 */
export default function NamedCatchallLayout({
  catchall,
  specific,
}: {
  catchall: ReactNode
  specific: ReactNode
}) {
  return (
    <div id="named-catchall-layout">
      {catchall}
      {specific}
    </div>
  )
}
