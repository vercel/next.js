import { ReactNode, Suspense } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <html>
        <body>{children}</body>
      </html>
    </Suspense>
  )
}
