import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Year } from './year'

export const metadata: Metadata = {
  title: 'Global Not Found',
}

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <h1>Global Not Found</h1>
        <Suspense>
          <Year />
        </Suspense>
      </body>
    </html>
  )
}
