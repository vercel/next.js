import type { ReactNode } from 'react'

export default function Layout({
  children,
  info,
}: {
  children: ReactNode
  info: ReactNode
}) {
  return (
    <>
      {children}
      {info}
    </>
  )
}
