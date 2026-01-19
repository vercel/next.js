import type { ReactNode } from 'react'
import Link from 'next/link'

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <nav>
          <ul>
            <li>
              <Link href="/one">(static) Param: one</Link>
            </li>
            <li>
              <Link href="/one?search=example&filter=true">
                (static) Param: one with searchParams
              </Link>
            </li>
            <li>
              <Link href="/two">(dynamic) Param: two</Link>
            </li>
            <li>
              <Link href="/two?search=example&filter=true">
                (dynamic) Param: two with searchParams
              </Link>
            </li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  )
}
