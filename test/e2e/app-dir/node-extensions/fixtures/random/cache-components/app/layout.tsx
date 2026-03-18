import { Suspense } from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <main>
          <Suspense fallback="loading...">{children}</Suspense>
        </main>
      </body>
    </html>
  )
}
