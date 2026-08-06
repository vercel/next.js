import { lang } from 'next/root-params'
import { ReactNode } from 'react'

export async function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  const currentLang = await lang()
  return (
    <html lang={currentLang}>
      <body>
        <p data-testid="lang-value">lang: {currentLang}</p>
        {children}
      </body>
    </html>
  )
}
