export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'fr' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return <h1>Locale: {locale}</h1>
}
