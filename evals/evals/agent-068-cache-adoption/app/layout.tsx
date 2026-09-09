import Link from 'next/link'
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header data-testid="site-header">
          <strong data-testid="brand">Acme Outfitters</strong>
          <nav data-testid="site-nav">
            <Link href="/">Home</Link> <Link href="/products">Catalog</Link>{' '}
            <Link href="/cart">Cart</Link> <Link href="/account">Account</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  )
}
