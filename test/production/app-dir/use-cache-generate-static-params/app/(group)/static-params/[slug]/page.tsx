async function getCachedParams() {
  'use cache'
  return [{ slug: 'known' }]
}

export async function generateStaticParams() {
  return getCachedParams()
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>{slug}</p>
}
