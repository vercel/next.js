import type { ReactNode } from 'react'

export const runtime = 'nodejs'
export const preferredRegion = 'iad1'
export const maxDuration = 10

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
