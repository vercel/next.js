import { ReactNode, Suspense } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback="loading">{children}</Suspense>
      </body>
    </html>
  )
}
