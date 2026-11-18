import type { ReactNode } from 'react'

export const runtime = 'edge'
export const preferredRegion = 'iad1'
export const maxDuration = 10

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
