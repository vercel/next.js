import type { ReactNode } from 'react'

// The empty descendant below this layout has structure but no page or default.
// It must not cause this named-only layout to acquire a children slot.
export default function Layout({ slot }: { slot: ReactNode }) {
  return <main>{slot}</main>
}
