import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<p>Loading...</p>}>
          <Dynamic />
        </Suspense>
        {children}
      </body>
    </html>
  )
}

async function Dynamic() {
  await connection()

  return (
    <p>
      Layout: <span id="layout-date">{new Date().toISOString()}</span>
    </p>
  )
}
