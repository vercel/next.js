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
  // resolves it dynamically instead. The long revalidate keeps the entry a
  // fresh hit for the duration of the test, isolating it from the in-memory
  // handler dropping the entry at `revalidate` (and thus from dev
  // stale-while-revalidate).
  // TODO(make-dev-fast): Once the dev in-memory handler serves stale entries
  // (SWR), the long revalidate can be dropped.
  cacheLife({ stale: 10, revalidate: 120, expire: 3600 })
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
