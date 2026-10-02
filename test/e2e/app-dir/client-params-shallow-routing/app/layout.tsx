import { Suspense, type ReactNode } from 'react'
import { Fallback } from './fallback'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<Fallback />}>{children}</Suspense>
      </body>
    </html>
  )
}
