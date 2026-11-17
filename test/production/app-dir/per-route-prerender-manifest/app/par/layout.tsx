import { ReactNode } from 'react'

export default function Layout({
  children,
  slot,
  other,
}: {
  children: ReactNode
  slot: ReactNode
  other: ReactNode
}) {
  return (
    <div>
      {children}
      {slot}
      {other}
    </div>
  )
}
