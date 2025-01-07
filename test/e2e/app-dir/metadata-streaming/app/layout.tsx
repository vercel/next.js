import Link from 'next/link'
import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div>
          <Link href="/slow" id="to-slow">
            {`to /slow`}
          </Link>
          <br />
          <Link href="/" id="to-home">
            {`to /`}
          </Link>
        </div>
        {children}
      </body>
    </html>
  )
}
