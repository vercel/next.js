'use cache'

import Link from 'next/link'
import { locale } from 'next/root-params'

export async function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'de' }]
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang={await locale()}>
      <body>
        <Link href="/cached-root-params/en" prefetch={false}>
          en
        </Link>
        <Link href="/cached-root-params/de" prefetch={false}>
          de
        </Link>
        {children}
      </body>
    </html>
  )
}
