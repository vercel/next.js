'use client'

import { Suspense } from 'react'
import { RouterUrl } from './router-url'

export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <Suspense>
          <RouterUrl />
        </Suspense>
        <h1 id="global-error">Global error</h1>
      </body>
    </html>
  )
}
