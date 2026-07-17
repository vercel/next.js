import { cacheLife } from 'next/cache'
import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <CachedPage slug={slug} />
}

async function CachedPage({ slug }: { slug: string }) {
  'use cache'

  cacheLife('hours')

  if (slug !== 'known') {
    notFound()
  }

  return <p>known</p>
}
