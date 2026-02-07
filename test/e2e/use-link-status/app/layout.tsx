import React, { Suspense } from 'react'
import NavBar from './nav-bar'
import DebugMode from './debug-mode'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <NavBar />
        {children}
        <Suspense>
          <DebugMode />
        </Suspense>
      </body>
    </html>
  )
}

export const dynamic = 'force-dynamic'
