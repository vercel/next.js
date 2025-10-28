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
