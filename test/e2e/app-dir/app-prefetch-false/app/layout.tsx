import Link from 'next/link'
import React from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <div>
          <Link prefetch={false} href="/foo">
            foo
          </Link>
        </div>
        <div>
          <Link prefetch={false} href="/foo/bar">
            foo/bar
          </Link>
        </div>
        {children}
      </body>
    </html>
  )
}
