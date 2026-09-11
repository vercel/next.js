import type { ReactNode } from 'react'

/** Incomplete catch-alls can be unreachable at more than one slot depth. */
export default function NestedLayout({
  children,
  outer,
}: {
  children: ReactNode
  outer: ReactNode
}) {
  return (
    <>
      {children}
      {outer}
    </>
  )
}
