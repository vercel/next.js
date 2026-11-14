import type { ReactNode } from 'react'
import Link from 'next/link'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/acme/a">/acme/a</Link>
          <Link href="/acme/b">/acme/b</Link>
          <Link href="/account">/account</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
