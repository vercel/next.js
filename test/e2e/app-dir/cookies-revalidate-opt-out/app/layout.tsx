import { Suspense, type ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
      </body>
    </html>
  )
}
