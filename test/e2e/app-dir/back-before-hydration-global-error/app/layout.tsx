import { Suspense } from 'react'
import { RouterUrl } from './router-url'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Suspense>
          <RouterUrl />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
