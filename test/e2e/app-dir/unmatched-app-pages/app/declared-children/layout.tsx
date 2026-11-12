import type { ReactNode } from 'react'

/**
 * /declared-children can render children/page with @panel/default. However,
 * /declared-children/details only has a page in @panel, so its declared
 * children slot would use Next.js' built-in not-found default. Strict route
 * matching prunes that incomplete matcher and reports the panel page as
 * unreachable.
 */
export default function DeclaredChildrenLayout({
  children,
  panel,
}: {
  children: ReactNode
  panel: ReactNode
}) {
  return (
    <>
      {children}
      {panel}
    </>
  )
}
