import { ReactNode, Suspense } from 'react'
import { connection } from 'next/server'

async function Dynamic() {
  await connection()
  return null
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense>
          <Dynamic />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
