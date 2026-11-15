import type { ReactNode } from 'react'

export const runtime = 'nodejs'
export const preferredRegion = 'iad1'
export const maxDuration = 60

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
