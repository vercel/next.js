import { Suspense } from 'react'
import { ClientSuspends } from './client-suspends'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <h1>Shell</h1>
        <Suspense fallback={<p>Loading…</p>}>
          <ClientSuspends />
          {children}
        </Suspense>
      </body>
    </html>
  )
}
