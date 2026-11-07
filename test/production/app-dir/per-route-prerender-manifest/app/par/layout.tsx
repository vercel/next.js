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
      {children}
      {slot}
    </div>
  )
}
