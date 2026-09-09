import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Acme Storefront — Account',
  description: 'Manage your Acme Storefront plan and orders.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Account</Link> <Link href="/orders">Orders</Link>
        </nav>
        {children}
        <footer>© 2026 Acme Storefront, Inc.</footer>
      </body>
    </html>
  )
}
