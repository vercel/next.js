import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <head />
      <body>
        <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
      </body>
    </html>
  )
}
