import type { ReactNode } from 'react'
import { Suspense } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback="Loading...">{children}</Suspense>
      </body>
    </html>
  )
}
