import { Suspense, type ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  // The optional catch-all reads runtime params with Cache Components enabled.
  return (
    <html>
      <body>
        <Suspense fallback={null}>{children}</Suspense>
      </body>
    </html>
  )
}
