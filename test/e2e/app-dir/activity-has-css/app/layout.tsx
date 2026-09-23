import Link from 'next/link'
import { ReactNode } from 'react'

import './globals.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/page-a" prefetch={false}>
            Page A
          </Link>
          <Link href="/page-b" prefetch={false}>
            Page B
          </Link>
        </nav>
        <div className="status-banner" data-testid="status-banner">
          Layout status
        </div>
        {children}
      </body>
    </html>
  )
}
