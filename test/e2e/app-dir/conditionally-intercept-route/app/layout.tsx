import { ReactNode } from 'react'
import Link from 'next/link'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <hr />
        <Link href={'/'} id={'back-to-index'}>
          Back to index
        </Link>
      </body>
    </html>
  )
}
