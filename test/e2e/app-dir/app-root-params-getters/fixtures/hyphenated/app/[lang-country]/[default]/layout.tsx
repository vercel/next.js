// `lang-country` (not a valid identifier) and `default` (reserved word)
// cannot be named imports — they are accessed through the module namespace.
import * as rootParams from 'next/root-params'
import type { ReactNode } from 'react'

export default async function Root({ children }: { children: ReactNode }) {
  return (
    <html lang={await rootParams['lang-country']()}>
      <body>{children}</body>
    </html>
  )
}

export async function generateStaticParams() {
  return [{ 'lang-country': 'en-us', default: 'main' }]
}
