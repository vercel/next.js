import type { ReactNode } from 'react'

export const runtime = 'nodejs'
export const preferredRegion = 'fra1'
export const maxDuration = 30

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
    <>
      {children}
      {slot}
      {other}
    </>
  )
}
