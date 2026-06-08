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
  // An expire value below 5 minutes and a stale time below 30s excludes this
  // cache from static shell and from the runtime prefetch, so it resolves in
  // the dynamic stage.
  cacheLife({ stale: 29, revalidate: 1, expire: 60 })
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
