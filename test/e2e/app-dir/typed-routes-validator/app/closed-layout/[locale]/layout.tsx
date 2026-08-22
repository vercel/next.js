type Locale = 'en' | 'de'

export const dynamicParams = false

export function generateStaticParams(): { locale: Locale }[] {
  return [{ locale: 'en' }, { locale: 'de' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  return <div data-locale={locale}>{children}</div>
}
