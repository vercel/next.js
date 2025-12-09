import Link from 'next/link'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <nav
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            gap: '16px',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
          }}
        >
          <Link href="/" style={{ color: '#0070f3' }}>
            Home
          </Link>
          <Link href="/dynamic" style={{ color: '#0070f3' }}>
            Dynamic APIs
          </Link>
          <Link href="/nested" style={{ color: '#0070f3' }}>
            Nested Suspense
          </Link>
          <Link href="/item/test-slug" style={{ color: '#0070f3' }}>
            Dynamic Params
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
