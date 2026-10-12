import { cacheLife } from 'next/cache'

export async function ShortStaleCache({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const data = await getShortStaleCachedData(cacheKey)
  console.log(`after short-stale cache read - ${label}`)
  return (
    <dl>
      <dt>Short-stale Cached Data</dt>
      <dd>{data}</dd>
    </dl>
  )
}

async function getShortStaleCachedData(_key: string) {
  'use cache'
  // A short stale time (below the runtime-prefetch threshold) paired with a
  // long expire time. The long expire keeps the entry in the static shell, so
  // an initial load, and a navigation into a route without runtime prefetch,
  // resolves it during the static stage. The short stale time excludes it from
  // the runtime prefetch shell, so a navigation into a runtime-prefetch route
  // resolves it dynamically instead. On a warm reload the entry may be past its
  // 1s revalidate, but the dev server serves it stale (SWR), so it stays a hit.
  cacheLife({ stale: 10, revalidate: 1, expire: 3600 })
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
