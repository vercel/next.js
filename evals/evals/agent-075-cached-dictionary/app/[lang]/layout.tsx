import Link from 'next/link'
import { getDictionary } from '@/lib/dictionary'

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const dict = await getDictionary()
  return (
    <html lang={lang}>
      <body>
        <nav>
          <Link href={`/${lang}`}>{dict.nav.home}</Link>{' '}
          <Link href={`/${lang}/about`}>{dict.nav.about}</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }]
}
