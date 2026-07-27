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
          <br />
          <Link href="/suspenseful/dynamic" id="to-suspenseful-dynamic">
            {`to /suspenseful/dynamic`}
          </Link>
          <br />
          <Link href="/suspenseful/static" id="to-suspenseful-static">
            {`to /suspenseful/static`}
          </Link>
        </div>
        {children}
      </body>
    </html>
  )
}
