import type { ReactNode } from 'react'

export default function OuterLayout({
  children,
  inner,
}: {
  children: ReactNode
  inner: ReactNode
}) {
  return (
    <>
      {children}
      {inner}
    </>
  )
}
