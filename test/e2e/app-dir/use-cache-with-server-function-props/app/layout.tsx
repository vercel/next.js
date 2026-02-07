import Link from 'next/link'
import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <p>
            <Link href="/server-action">Server Action</Link>
          </p>
          <p>
            <Link href="/nested-cache">Nested Cache</Link>
          </p>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
