import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

export default async function Root({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <Suspense>
          <Connection>{children}</Connection>
        </Suspense>
      </body>
    </html>
  )
}

async function Connection({ children }: { children: ReactNode }) {
  await connection()

  return children
}
