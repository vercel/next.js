import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div>Loading root...</div>}>
      <html>
        <body>
          <Suspense fallback="...">
            <Now />
          </Suspense>
          {children}
        </body>
      </html>
    </Suspense>
  )
}

async function Now() {
  await connection()
  return <span>{Date.now()}</span>
}
