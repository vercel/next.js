import Link from 'next/link'
import type { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/" prefetch={true} id="link-index">
            Index
          </Link>{' '}
          <Link href="/b" id="link-b">
            /b
          </Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
