import type { ReactNode } from 'react'
import Link from 'next/link'

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'de' }]
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Link href="/de/foo" prefetch={false}>
          German foo
        </Link>
        <Link href="/en/bar" prefetch={false}>
          English bar
        </Link>
        {children}
      </body>
    </html>
  )
}
