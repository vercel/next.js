import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Northstar Supply',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Catalog</Link> <Link href="/account">Account</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
