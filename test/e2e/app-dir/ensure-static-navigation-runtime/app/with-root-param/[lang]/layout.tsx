import type { ReactNode } from 'react'

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'pl' }]
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
