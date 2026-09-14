import Link from 'next/link'
import { ReactNode } from 'react'
import { HydrationMarker } from './hydration-marker'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          maxWidth: 900,
          margin: '0 auto',
          padding: '2rem 1rem',
          lineHeight: 1.6,
          color: '#111',
        }}
      >
        <HydrationMarker />
        <nav style={{ display: 'flex', gap: 12, marginBottom: '1rem' }}>
          <Link href="/" id="link-to-home">
            Home
          </Link>
          <Link href="/post/1" id="link-to-post-1">
            Post 1
          </Link>
          <Link href="/post/2" id="link-to-post-2">
            Post 2
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
