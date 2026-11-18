import { Suspense, type ReactNode } from 'react'

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'de' }, { locale: 'fr' }]
}

export default function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  return (
    <section>
      <Suspense fallback={null}>
        <LocaleHeading params={params} />
      </Suspense>
      {children}
    </section>
  )
}

async function LocaleHeading({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return <h1 id="server-locale">Server locale: {locale}</h1>
}
