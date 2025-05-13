import { Suspense } from 'react'
import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<p>loading...</p>}>{children}</Suspense>
      </body>
    </html>
  )
}
