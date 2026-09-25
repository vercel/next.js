import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import './style.css'

const testFont = localFont({ src: './test-font.woff2' })

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body className={testFont.className}>{children}</body>
    </html>
  )
}
