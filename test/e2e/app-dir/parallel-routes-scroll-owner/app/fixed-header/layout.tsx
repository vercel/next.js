import type { ReactNode } from 'react'

export default function FixedHeaderLayout({
  children,
  header,
}: {
  children: ReactNode
  header: ReactNode
}) {
  return (
    <>
      {header}
      {children}
    </>
  )
}
