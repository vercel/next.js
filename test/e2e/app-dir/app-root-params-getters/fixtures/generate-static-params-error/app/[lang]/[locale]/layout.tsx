import { lang } from 'next/root-params'
import { ReactNode } from 'react'

export default async function Root({ children }: { children: ReactNode }) {
  return (
    <html lang={await lang()}>
      <body>{children}</body>
    </html>
  )
}

export async function generateStaticParams() {
  // This should error: we're reading `lang` inside the generateStaticParams
  // that is supposed to define it. The `lang` param is not yet available
  // because no parent segment has provided it.
  const l = await lang()
  return [{ lang: l, locale: 'us' }]
}
