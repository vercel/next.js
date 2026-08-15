import type { ReactNode } from 'react'

/**
 * The children catch-all is combined with @first/foo and @second/bar, but each
 * candidate is still missing the other named slot. All three pages are left
 * out of the matcher set, so strict matching reports each one as unreachable.
 */
export default function DisagreeingSlotsLayout({
  children,
  first,
  second,
}: {
  children: ReactNode
  first: ReactNode
  second: ReactNode
}) {
  return (
    <>
      {children}
      {first}
      {second}
    </>
  )
}
