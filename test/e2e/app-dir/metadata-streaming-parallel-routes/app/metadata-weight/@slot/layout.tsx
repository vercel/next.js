import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  weight: 1,
}

export const viewport: Viewport = {
  weight: -1,
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
