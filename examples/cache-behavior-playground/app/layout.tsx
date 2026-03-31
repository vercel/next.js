import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Next.js Cache Behavior Playground',
  description:
    'Exhaustive demonstration of Next.js caching primitives comparing next start vs Vercel',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <nav>
            <a href="/" className="logo">
              Cache Playground
            </a>
            <div className="nav-links">
              <a href="/dashboard">Dashboard</a>
              <a
                href="https://github.com/vercel/nextjs-cache-playground"
                target="_blank"
                rel="noopener"
              >
                GitHub
              </a>
            </div>
          </nav>
        </header>
        <main className="main">{children}</main>
        <footer className="footer">
          <p>
            Built to document and test Next.js caching behavior across
            platforms.
          </p>
        </footer>
      </body>
    </html>
  )
}
