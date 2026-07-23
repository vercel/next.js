import { ReactNode } from 'react'
import { headers } from 'next/headers'

export default async function Root({ children }: { children: ReactNode }) {
  await headers()
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
