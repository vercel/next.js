import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <Suspense fallback={<div>loading...</div>}>{children}</Suspense>
      </body>
    </html>
  )
}
