import { ReactNode } from 'react'
import Link from 'next/link'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/ppr">ppr</Link>
          <Link href="/dynamic">dynamic</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
