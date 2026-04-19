import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

export async function generateStaticParams() {
  return [{ lang: 'en' }]
}

export const unstable_instant = false

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback="...">
          <Now />
        </Suspense>
        {children}
      </body>
    </html>
  )
}

async function Now() {
  await connection()
  return <span>{Date.now()}</span>
}
