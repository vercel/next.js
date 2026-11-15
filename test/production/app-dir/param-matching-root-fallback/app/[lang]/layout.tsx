import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
