import Link from 'next/link'
import './global.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <body className="bg-white">
        <nav className="flex gap-4 p-4">
          <Link
            href="/"
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
        </nav>
        {children}
      </body>
    </html>
  )
}
