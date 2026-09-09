import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Acme SDK Docs',
  description: 'Guides, integration walkthroughs, and changelog for the Acme SDK.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <span className="brand">Acme SDK</span>
          <nav className="site-nav">
            <Link href="/" data-testid="nav-home">
              Overview
            </Link>
            <Link href="/guide" data-testid="nav-guide">
              Integration guide
            </Link>
            <Link href="/changelog/1" data-testid="nav-changelog">
              Changelog
            </Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
