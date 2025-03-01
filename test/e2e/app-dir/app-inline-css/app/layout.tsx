import Link from 'next/link'
import './global.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/" prefetch={false}>
            Home
          </Link>
          {' | '}
          <Link href="/a" id="link-a" prefetch={false}>
            Page A
          </Link>
          {' | '}
          <Link href="/b" id="link-b" prefetch={false}>
            Page B
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
