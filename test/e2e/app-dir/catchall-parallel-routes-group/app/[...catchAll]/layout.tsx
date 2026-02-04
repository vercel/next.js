import { ReactNode } from 'react'

export default function Layout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <div id="catch-all-layout">
      <h2>Catch-all Layout</h2>
      {slot}
      {children}
    </div>
  )
}
