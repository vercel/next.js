import { 'lang-country' as langCountry } from 'next/root-params'
import type { ReactNode } from 'react'

export default async function Root({ children }: { children: ReactNode }) {
  return (
    <html lang={await langCountry()}>
      <body>{children}</body>
    </html>
  )
}

export async function generateStaticParams() {
  return [{ 'lang-country': 'en-us' }]
}
