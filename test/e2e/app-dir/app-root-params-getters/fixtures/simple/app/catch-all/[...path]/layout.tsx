import type { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export async function generateStaticParams() {
  return [{ path: ['foo'] }]
}
