import { ReactNode, Suspense } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<p>Loading item...</p>}>{children}</Suspense>
      </body>
    </html>
  )
}
