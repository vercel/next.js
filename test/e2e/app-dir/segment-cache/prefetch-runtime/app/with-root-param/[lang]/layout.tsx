import Link from 'next/link'
import { lang } from 'next/root-params'
import { ReactNode } from 'react'

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  const currentLang = await lang()
  return (
    <html lang={currentLang}>
      <body style={{ fontFamily: 'monospace' }}>
        <Header />
        {children}
      </body>
    </html>
  )
}

async function Header() {
  const currentLang = await lang()
  return (
    <header>
      <Link href={`/with-root-param/${currentLang}`} prefetch={false}>
        Home (for lang: {currentLang})
      </Link>
    </header>
  )
}

export function generateStaticParams() {
  return [{ lang: 'en' }]
}
