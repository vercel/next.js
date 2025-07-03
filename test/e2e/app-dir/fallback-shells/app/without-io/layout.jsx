import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <Suspense>
        <body>{children}</body>
      </Suspense>
    </html>
  )
}
