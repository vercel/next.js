import type { ReactNode } from 'react'

/**
 * @slot has a user-authored default, so the broad children catch-all remains
 * in the matcher set. That default deliberately calls notFound(), proving an
 * explicit default can preserve the old perma-404 behavior.
 */
export default function DefaultNotFoundLayout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <div id="default-not-found-layout">
      {children}
      {slot}
    </div>
  )
}
