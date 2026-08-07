import { cacheLife, unstable_cache } from 'next/cache'
import { connection } from 'next/server'

const getInnerValue = unstable_cache(
  async () => Date.now(),
  ['cache-consumer-foreground-revalidate-inner'],
  {
    revalidate: false,
    tags: ['cache-consumer-foreground-revalidate-inner'],
  }
)

async function getOuterValue(key: string) {
  'use cache'
  cacheLife({ revalidate: 60, expire: 300 })

  return {
    key,
    innerValue: await getInnerValue(),
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  await connection()

  const { key } = await params
  const value = await getOuterValue(key)

  return <p id="inner-value">{value.innerValue}</p>
}
