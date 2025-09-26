import { unstable_cacheLife } from 'next/cache'

type CacheLife = Parameters<typeof unstable_cacheLife>[0]

async function getCachedValue(cacheLife: CacheLife) {
  'use cache'

  unstable_cacheLife(cacheLife)

  return Math.random()
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: CacheLife }>
}) {
  const { slug } = await params

  return <p>hello world {await getCachedValue(slug)}</p>
}

export function generateStaticParams() {
  return [{ slug: 'days' }, { slug: 'weeks' }]
}
