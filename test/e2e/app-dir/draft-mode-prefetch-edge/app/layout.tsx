import type { ReactNode } from 'react'

export const runtime = 'edge'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
