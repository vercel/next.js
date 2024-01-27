import Link from 'next/link'
import React from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <div>
          <Link href="/nested">to nested</Link>
        </div>
        <div>
          <Link href="/nested/subroute">to nested subroute</Link>
        </div>
        <h1>Root Layout</h1>
        <div>{children}</div>
      </body>
    </html>
  )
}
