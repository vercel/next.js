import type { ReactNode } from 'react'

export const runtime = 'edge'
export const preferredRegion = 'iad1'
export const maxDuration = 10

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
