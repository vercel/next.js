import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: { default: 'Parent', template: '%s | Parent' },
  other: { parentOnly: 'parent', overridden: 'parent' },
}

export const viewport: Viewport = {
  maximumScale: 3,
  themeColor: 'blue',
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
