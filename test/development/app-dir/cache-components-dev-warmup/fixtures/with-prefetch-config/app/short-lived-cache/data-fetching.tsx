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
  // TODO(make-dev-fast): This should be able to use `cacheLife('seconds')`. We
  // use a long `revalidate` instead so the entry stays a fresh hit for the
  // duration of the test, isolating it from the in-memory handler dropping the
  // entry at `revalidate` (and thus from dev SWR). `expire` stays under 5
  // minutes so the entry is still short-lived (excluded from the static shell,
  // deferred to the runtime stage), and `stale` stays at the runtime-prefetch
  // threshold so it is not also excluded from the runtime prefetch shell. Once
  // the dev in-memory handler serves stale entries (SWR), flip this back to
  // `cacheLife('seconds')`.
  cacheLife({ stale: 30, revalidate: 120, expire: 240 })
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
