import Link from 'next/link'
import './global.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <body className="bg-white">
        <nav className="flex gap-4 p-4">
          <Link
            href="/"
            id="link-home"
            prefetch={false}
            className="text-blue-500 hover:underline"
          >
            Home
          </Link>
          <Link
            href="/a"
            id="link-a"
            prefetch={false}
            className="text-blue-500 hover:underline"
          >
            Page A
          </Link>
          <Link
            href="/b"
            id="link-b"
            prefetch={false}
            className="text-blue-500 hover:underline"
          >
            Page B
          </Link>
          <Link
            href="/nested"
            id="link-nested"
            prefetch={false}
            className="text-blue-500 hover:underline"
          >
            Nested
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
