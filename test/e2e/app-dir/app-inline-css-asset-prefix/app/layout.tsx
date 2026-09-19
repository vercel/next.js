import type { ReactNode } from 'react'
import './global.css'
import { font } from './font'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html className={font.variable}>
      <body>{children}</body>
    </html>
  )
}
