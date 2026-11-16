import { ReactNode } from 'react'

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return (
    <html lang={lang}>
      <body>
        <p id="layout-language">{lang}</p>
        {children}
      </body>
    </html>
  )
}
