import type { ReactNode } from 'react'
import Link from 'next/link'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Products</Link> <Link href="/account">Account</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
