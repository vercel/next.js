import Link from 'next/link'
import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/">/index</Link> |{' '}
          <Link href="/navigation">/navigation</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
