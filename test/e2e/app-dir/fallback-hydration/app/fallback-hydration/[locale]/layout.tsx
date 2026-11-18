import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'de' }, { locale: 'fr' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <section>
      <h1 id="server-locale">Server locale: {locale}</h1>
      {children}
    </section>
  )
}
