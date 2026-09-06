import Link from 'next/link'
import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/" prefetch={false}>
            Home
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
