'use client'

import { ReactNode } from 'react'

const isServer = typeof window === 'undefined'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html {...(isServer ? { className: 'server-html' } : undefined)}>
      <body>{children}</body>
    </html>
  )
}
