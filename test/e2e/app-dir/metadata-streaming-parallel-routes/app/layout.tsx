import Link from 'next/link'
import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div>
          <Link href="/parallel-routes" id="to-parallel-routes">
            {`to /parallel-routes`}
          </Link>
          <br />
          <Link href="/parallel-routes-default" id="to-default">
            {`to /parallel-routes-default`}
          </Link>
          <br />

          <Link href="/parallel-routes-no-children" id="to-no-children">
            {`to /parallel-routes-no-children`}
          </Link>
          <br />
        </div>
        {children}
      </body>
    </html>
  )
}
