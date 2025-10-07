import { Suspense } from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <html>
        <body>{children}</body>
      </html>
    </Suspense>
  )
}
