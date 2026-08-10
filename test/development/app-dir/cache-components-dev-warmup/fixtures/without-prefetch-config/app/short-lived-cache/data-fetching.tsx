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
  // `seconds` is a short-lived profile (its expire is under 5 minutes), so the
  // entry is excluded from the static shell and deferred to the runtime stage,
  // while its stale time at the runtime-prefetch threshold keeps it in the
  // runtime prefetch shell. On a warm reload the entry may be past its 1s
  // revalidate, but the dev server serves it stale (SWR), so it resolves as a
  // hit at the runtime stage instead of a cold miss.
  cacheLife('seconds')
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
