import Script from 'next/script'
import { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
      <Script
        src="https://example.com/script.js"
        strategy="beforeInteractive"
      />
    </html>
  )
}
