import type { ReactNode } from 'react'

export const runtime = 'edge'
export const preferredRegion = 'fra1'
export const maxDuration = 30

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
