import Link from 'next/link'
import { ReactNode, Suspense } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <ul>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/slow-without-fallback">
              Slow Page without fallback
            </Link>
          </li>
          <li>
            <Link href="/slow-with-fallback">Slow Page with fallback</Link>
          </li>
        </ul>
        <main>
          <Suspense>{children}</Suspense>
        </main>
      </body>
    </html>
  )
}
