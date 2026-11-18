import type { ReactNode } from 'react'

export default function Layout({
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
