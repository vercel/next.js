import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { metadataBase: 'https://example.com' }

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
