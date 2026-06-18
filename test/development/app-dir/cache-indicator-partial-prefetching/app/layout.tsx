import Link from 'next/link'
import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/">/index</Link> |{' '}
          <Link href="/params/some-id" prefetch={true}>
            /params/some-id
          </Link>{' '}
          |{' '}
          <Link href="/private" prefetch={true}>
            /private
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
