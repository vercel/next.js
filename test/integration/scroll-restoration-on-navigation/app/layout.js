import Link from 'next/link'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <header
          style={{
            height: 150,
            position: 'sticky',
            top: 0,
            backgroundColor: 'gray',
            opacity: 0.8,
            zIndex: 1000,
          }}
        >
          <Link href="/" id="to-page-1">
            Page 1
          </Link>
          <Link href="/page-2" id="to-page-2">
            Page 2
          </Link>
        </header>

        {children}
      </body>
    </html>
  )
}
