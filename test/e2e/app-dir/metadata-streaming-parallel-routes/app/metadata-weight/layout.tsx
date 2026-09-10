import type { ReactNode } from 'react'

export default function Layout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <main>
      <div id="metadata-weight-children">{children}</div>
      <div id="metadata-weight-slot">{slot}</div>
    </main>
  )
}
