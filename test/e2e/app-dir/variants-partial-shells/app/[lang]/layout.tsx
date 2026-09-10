import type { JSX, ReactNode } from 'react'
import { lang } from 'next/root-params'

export function generateStaticParams(): Array<{ lang: string }> {
  return [{ lang: 'en' }, { lang: 'de' }]
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}): Promise<JSX.Element> {
  const language = await lang()

  return (
    <html lang={language}>
      <body>
        <p id="layout-language">{language}</p>
        {children}
      </body>
    </html>
  )
}
