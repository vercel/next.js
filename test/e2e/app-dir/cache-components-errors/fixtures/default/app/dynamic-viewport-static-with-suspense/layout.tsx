import { Suspense } from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <Suspense>
        <body>
          <main>{children}</main>
        </body>
      </Suspense>
    </html>
  )
}
