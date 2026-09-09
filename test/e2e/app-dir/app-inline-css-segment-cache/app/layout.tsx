import Link from 'next/link'
import './global.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/" id="link-home">
            Home
          </Link>
          {' | '}
          <Link href="/nested" id="link-nested">
            Nested
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
