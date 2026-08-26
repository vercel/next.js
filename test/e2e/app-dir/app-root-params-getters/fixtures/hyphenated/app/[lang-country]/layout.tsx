// `lang-country` is not a valid JS identifier, so it cannot be a named import —
// it is accessed through the module namespace instead.
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
  return [{ 'lang-country': 'en-us' }]
}
