import { Suspense } from 'react'
import { ReactNode } from 'react'

async function getCachedDate() {
  'use cache'

  return new Date().toISOString()
}

export default async function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <p id="cached-in-layout">{await getCachedDate()}</p>
        <Suspense fallback={<p id="loading">Loading...</p>}>
          {children}
        </Suspense>
      </body>
    </html>
  )
}
