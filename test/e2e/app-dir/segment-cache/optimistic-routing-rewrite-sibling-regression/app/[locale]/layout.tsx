import { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }]
}

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
