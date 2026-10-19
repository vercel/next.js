import type { ReactNode } from 'react'

export const ensureStatic = 'navigation'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
