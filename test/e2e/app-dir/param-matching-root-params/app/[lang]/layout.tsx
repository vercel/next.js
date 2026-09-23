import type { ReactNode } from 'react'
import Link from 'next/link'

export async function experimental_generateParamMatching() {
  return { lang: 'fallback' } as const
}

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <h1>Language-independent shell</h1>
        <nav>
          <Link href="/en" prefetch={false}>
            English
          </Link>
          <Link href="/fr" prefetch={false}>
            French
          </Link>
          <Link href="/de" prefetch={false}>
            German
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
