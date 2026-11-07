import Link from 'next/link'
import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/">/index</Link> |{' '}
          <Link href="/navigation">/navigation</Link> |{' '}
          <Link href="/slow-render/1">/slow-render/1</Link> |{' '}
          <Link href="/slow-render/2">/slow-render/2</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
