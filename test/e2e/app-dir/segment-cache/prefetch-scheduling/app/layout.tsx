import { Suspense } from 'react'
import { RouterAct } from '@next/router-act/component'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense>
      <html lang="en">
        <body>
          {children}
          <RouterAct />
        </body>
      </html>
    </Suspense>
  )
}
