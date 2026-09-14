import Link from 'next/link'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <Link href="/" id="link-home">
            Home (/)
          </Link>
          <Link href="/b" id="link-b">
            Page B (/b)
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
