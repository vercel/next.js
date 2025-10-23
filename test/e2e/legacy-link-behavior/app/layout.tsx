import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

export default async function Root({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <Suspense>
        <Connection>
          <body>{children}</body>
        </Connection>
      </Suspense>
    </html>
  )
}

async function Connection({ children }: { children: ReactNode }) {
  await connection()

  return children
}
