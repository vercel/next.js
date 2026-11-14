import type { ReactNode } from 'react'

export const metadata = {
  title: 'Cache Components export',
  description: 'A complete static deployment',
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
