import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Ledger',
  description: 'Invoicing for small teams.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav aria-label="Main">
            <Link href="/">Ledger</Link>
            {' · '}
            <Link href="/pricing">Pricing</Link>
            {' · '}
            <Link href="/app">Workspace</Link>
          </nav>
        </header>
        {children}
        <footer>
          <p>Ledger · Invoicing for small teams</p>
        </footer>
      </body>
    </html>
  )
}
