'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function InnerGlobalError({ error }) {
  useRouter() // do nothing but ensure the call won't fail
  const searchParams = useSearchParams()
  if (searchParams.get('error-in-global-error') === '1') {
    throw new Error('error in global error')
  }

  return (
    <html>
      <head></head>
      <body>
        <h1>Custom Global Error</h1>
      </body>
    </html>
  )
}

export default function GlobalError({ error }) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <InnerGlobalError error={error} />
    </Suspense>
  )
}
