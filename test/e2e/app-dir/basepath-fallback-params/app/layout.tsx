import type { ReactNode } from 'react'
import { Suspense } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<p>Loading route parameters...</p>}>
          {children}
        </Suspense>
      </body>
    </html>
  )
}
