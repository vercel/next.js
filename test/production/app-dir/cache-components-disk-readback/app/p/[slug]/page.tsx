import { cacheLife } from 'next/cache'

export function generateStaticParams() {
  return [{ slug: '_build-placeholder' }]
}

async function getRenderId(slug: string) {
  'use cache'
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 })
  return `${slug}:${Date.now()}`
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p id="render-id">{await getRenderId(slug)}</p>
}
