import { lang, locale } from 'next/root-params'
import { ReactNode } from 'react'

export default async function Root({ children }: { children: ReactNode }) {
  return (
    <html lang={`${await lang()}-${await locale()}`}>
      <body>{children}</body>
    </html>
  )
}

export async function generateStaticParams() {
  return [
    { lang: 'en', locale: 'us' },
    { lang: 'es', locale: 'es' },
  ]
}
