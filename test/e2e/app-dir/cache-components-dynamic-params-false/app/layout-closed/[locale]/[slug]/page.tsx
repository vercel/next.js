export function generateStaticParams({
  params,
}: {
  params: { locale: string }
}) {
  return [{ slug: params.locale === 'en' ? 'a' : 'b' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  return (
    <p id="layout-closed-page">
      Layout route {locale}/{slug}
    </p>
  )
}
