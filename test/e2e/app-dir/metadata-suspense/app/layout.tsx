import Link from 'next/link'
import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <div>
          <Link href="/">to index</Link>
        </div>
        <div>
          <Link href="/about">to about</Link>
        </div>
        <Suspense fallback={<div>loading...</div>}>{children}</Suspense>
      </body>
    </html>
  )
}
