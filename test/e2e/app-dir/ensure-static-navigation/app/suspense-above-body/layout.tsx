import { Suspense, type ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <html>
        <body>{children}</body>
      </html>
    </Suspense>
  )
}
