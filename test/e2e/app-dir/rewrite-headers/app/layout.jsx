import { Suspense } from 'react'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
