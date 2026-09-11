import type { ReactNode } from 'react'

export default function Layout({
  children,
  other,
}: {
  children: ReactNode
  other: ReactNode
}) {
  return (
    <>
      {children}
      {other}
    </>
  )
}
