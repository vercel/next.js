export default async function StoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  return (
    <div id="story-page">
      <div id="story-locale">Locale: {locale}</div>
      <div id="story-slug">Story: {slug}</div>
    </div>
  )
}

export async function generateStaticParams() {
  return [{ slug: 'static-123' }]
}
