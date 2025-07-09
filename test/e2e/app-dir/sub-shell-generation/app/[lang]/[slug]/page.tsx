export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { slug } = await params

  return <p>slug: {slug}</p>
}

export function generateStaticParams({ params }: { params: { lang: string } }) {
  return params.lang === 'fr' ? [{ slug: '1' }] : []
}
