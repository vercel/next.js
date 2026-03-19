import { Suspense } from 'react'

export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
