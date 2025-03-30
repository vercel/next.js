import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const revalidate = 0
export async function generateStaticParams() {
  return [{ lang: 'en', locale: 'us' }]
}
