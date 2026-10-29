import type { ReactNode } from 'react'
import './layout-styles.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
