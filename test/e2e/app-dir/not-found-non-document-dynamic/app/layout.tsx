import { ReactNode, Suspense } from 'react'
import { connection } from 'next/server'

async function Dynamic() {
  await connection()
  return <p id="dynamic-layout">dynamic layout content</p>
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
