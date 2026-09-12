export function generateStaticParams() {
  return [
    { lang: 'nl-NL', slug: ['blog', 'post'] },
    { lang: 'en-US', slug: ['plain', 'static'] },
  ]
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string[] }>
}) {
  const { lang, slug } = await params

  return (
    <>
      <p id="app-locale">{lang}</p>
      <p id="app-slug">{slug.join('/')}</p>
    </>
  )
}
