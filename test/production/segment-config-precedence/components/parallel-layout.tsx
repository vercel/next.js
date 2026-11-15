import type { ReactNode } from 'react'

export default function ParallelLayout({
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
