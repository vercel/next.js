import { ReactNode } from 'react'

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const messages = (await import(`../../messages/${locale}.json`)).default

  return (
    <>
      <p id="subtitle">{messages.subtitle}</p>
      {children}
    </>
  )
}
