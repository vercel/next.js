import type { ReactNode } from 'react'

/**
 * The optional catch-all's broad matcher cannot satisfy @slot and is pruned.
 * /specific remains complete, but its exact children page wins there, so the
 * optional catch-all page does not participate in that matcher either.
 */
export default function OptionalCatchallLayout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <>
      {children}
      {slot}
    </>
  )
}
