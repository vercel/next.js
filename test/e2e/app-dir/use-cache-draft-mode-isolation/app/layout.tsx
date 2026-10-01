import { ReactNode, Suspense } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
