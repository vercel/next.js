import Link from 'next/link'
import { ReactNode } from 'react'

const hrefs = [
  '/dynamic-metadata',
  '/dynamic-metadata/partial',
  '/dynamic-page',
  '/dynamic-page/partial',
  '/fully-dynamic',
  '/fully-static',
]

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div>
          {hrefs.map((href) => (
            <div key={href}>
              <Link href={href} id={`to-${href}`} prefetch={false}>
                {`to ${href}`}
              </Link>
            </div>
          ))}
        </div>
        {children}
      </body>
    </html>
  )
}
