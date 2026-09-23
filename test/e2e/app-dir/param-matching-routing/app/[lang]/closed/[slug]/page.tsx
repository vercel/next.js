export const experimental_paramMatching = { slug: 'not-found' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  return (
    <main id="closed-page">
      <p id="params">{`${lang}/${slug}`}</p>
      <p id="generation">{performance.now().toFixed(5)}</p>
    </main>
  )
}
