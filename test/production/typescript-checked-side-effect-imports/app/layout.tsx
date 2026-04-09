import type { ReactNode } from 'react'
import './globals.css'
import './globals.sass'
import './globals.scss'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
