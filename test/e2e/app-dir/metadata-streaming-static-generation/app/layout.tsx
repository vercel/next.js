import Link from 'next/link'
import { ReactNode } from 'react'

const hrefs = [
  '/slow/dynamic',
  '/slow/static',
  '/',
  '/suspenseful/dynamic',
  '/suspenseful/static',
]

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div>
          {hrefs.map((href) => (
            <div key={href}>
              <Link href={href} id={`to-${href.replace('/', '')}`}>
                {`to ${href}`}
              </Link>
              <br />
            </div>
          ))}
        </div>
        {children}
      </body>
    </html>
  )
}
