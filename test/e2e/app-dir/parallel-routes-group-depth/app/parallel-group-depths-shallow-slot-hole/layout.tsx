import { ReactNode } from 'react'

export default function Layout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <div>
      <div id="slot">{slot}</div>
      <div id="children">{children}</div>
    </div>
  )
}
