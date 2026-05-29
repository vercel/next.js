import Link from 'next/link'
import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <p>
          <a href="/target-page">MPA Link</a>
        </p>
        <p>
          <Link href="/large-debug-data">Large Debug Data</Link>
        </p>
        <main>{children}</main>
      </body>
    </html>
  )
}
