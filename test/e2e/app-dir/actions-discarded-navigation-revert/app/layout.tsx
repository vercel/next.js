import { Suspense } from 'react'
import { connection } from 'next/server'
import { Controls } from './controls'
import { RenderCounter } from './render-counter'

// The stamp only changes when the router refreshes: navigations preserve the
// root layout, so a new stamp on the client means a refresh happened.
async function Stamp() {
  await connection()
  return <RenderCounter uuid={crypto.randomUUID()} />
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <Stamp />
        </Suspense>
        <Controls />
        {children}
      </body>
    </html>
  )
}
