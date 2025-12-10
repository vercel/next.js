import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
