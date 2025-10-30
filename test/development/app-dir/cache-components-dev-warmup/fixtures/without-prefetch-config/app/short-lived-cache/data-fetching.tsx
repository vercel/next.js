import { cacheLife } from 'next/cache'

export async function ShortLivedCache({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const data = await getShortLivedCachedData(cacheKey)
  console.log(`after short-lived cache read - ${label}`)
  return (
    <dl>
      <dt>Short-lived Cached Data (Page)</dt>
      <dd>{data}</dd>
    </dl>
  )
}

async function getShortLivedCachedData(_key: string) {
  'use cache'
  cacheLife('seconds')
  await new Promise((r) => setTimeout(r))
  return Math.random()
}

export async function DynamicCache({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const data = await getDynamicCachedData(cacheKey)
  console.log(`after dynamic cache read - ${label}`)
  return (
    <dl>
      <dt>Dynamic Cached Data (Page)</dt>
      <dd>{data}</dd>
    </dl>
  )
}

async function getDynamicCachedData(_key: string) {
  'use cache'
  cacheLife({
    stale: 20, // < DYNAMIC_STALE (excluded from runtime prerenders)
    revalidate: 2 * 60,
    expire: 3 * 60, // < DYNAMIC_EXPIRE (excluded from static prerenders)
  })
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
