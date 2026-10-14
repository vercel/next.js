import Link from 'next/link'
import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/">Home</Link>
          {' | '}
          <Link href="/static">Static</Link>
          {' | '}
          <Link href="/runtime">Runtime</Link>
          {' | '}
          <Link href="/dynamic">Dynamic</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
