import type { ReactNode } from 'react'

/** Route groups are transparent to both pruning and unmatched-page reporting. */
export default function GroupedLayout({
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
