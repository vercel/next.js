import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export function generateStaticParams() {
  return [
    { lang: 'en', locale: 'us' },
    { lang: 'fr', locale: 'de' },
  ]
}
