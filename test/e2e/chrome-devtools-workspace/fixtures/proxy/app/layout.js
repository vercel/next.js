import { Suspense } from 'react'

export default function Root({ children }) {
  return (
    <html>
      <body>
        <Suspense fallback="loading">{children}</Suspense>
      </body>
    </html>
  )
}
