type Locale = 'en' | 'de'

export const dynamicParams = false

export async function generateStaticParams(): Promise<{ locale: Locale }[]> {
  return [{ locale: 'en' }, { locale: 'de' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  return { title: locale }
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  return { themeColor: locale === 'en' ? 'black' : 'white' }
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  return locale
}
