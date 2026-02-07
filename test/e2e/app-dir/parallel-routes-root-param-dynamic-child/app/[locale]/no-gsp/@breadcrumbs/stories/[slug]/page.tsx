export default async function BreadcrumbsStoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  return (
    <div id="breadcrumbs-story">
      <div id="breadcrumbs-locale">Breadcrumbs Locale: {locale}</div>
      <div id="breadcrumbs-slug">Breadcrumbs Story: {slug}</div>
    </div>
  )
}
