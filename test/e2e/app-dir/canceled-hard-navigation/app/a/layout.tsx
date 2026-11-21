import type { ReactNode } from 'react'

export default function RootLayoutA({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
