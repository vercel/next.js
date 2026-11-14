import Link from 'next/link'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <header
          style={{
            position: 'sticky',
            top: 0,
            background: '#eee',
            padding: '10px',
            zIndex: 100,
          }}
        >
          <Link id="link-home" href="/">
            Home
          </Link>
        </header>
        {children}
      </body>
    </html>
  )
}
