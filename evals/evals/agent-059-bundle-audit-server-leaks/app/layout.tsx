import type { ReactNode } from 'react'
import Link from 'next/link'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Home</Link> <Link href="/support">Support</Link>{' '}
          <Link href="/admin">Admin</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
