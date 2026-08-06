import Link from 'next/link'
import { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <header>
          <Link href="/" prefetch={false}>
            Home
          </Link>
        </header>
        {children}
      </body>
    </html>
  )
}
