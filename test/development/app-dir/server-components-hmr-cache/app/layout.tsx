import { Suspense } from 'react'

export default function Root({ children }) {
  return (
    <html>
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
