export async function fetchCachedRandom(cacheKey: string) {
  return fetchCached(
    `https://next-data-api-endpoint.vercel.app/api/random?key=${encodeURIComponent('cached-' + cacheKey)}`
  )
}

export async function fetchCached(url: string) {
  const response = await fetch(url, { cache: 'force-cache' })
  return response.text()
}

export async function getCachedData(_key: string) {
  'use cache'
  await new Promise((r) => setTimeout(r))
  return Math.random()
}

export async function CachedData({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const data = await getCachedData(cacheKey)
  console.log(`after cache read - ${label}`)
  return (
    <dl>
      <dt>Cached Data</dt>
      <dd>{data}</dd>
    </dl>
  )
}

export async function SuccessiveCachedData({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  // This components tests if we correctly handle the case where resolving a cache
  // reveals another cache in the children. When we're filling caches, we should fill both.
  const data1 = await getCachedData(`${cacheKey}-successive-1`)
  return (
    <dl>
      <dt>Cached Data (successive reads)</dt>
      <dd>{data1}</dd>
      <dd>
        <SuccessiveCachedDataChild label={label} cacheKey={cacheKey} />
      </dd>
    </dl>
  )
}

async function SuccessiveCachedDataChild({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const data2 = await getCachedData(`${cacheKey}-successive-2`)
  console.log(`after successive cache reads - ${label}`)
  return <>{data2}</>
}

export async function CachedFetch({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const data = await fetchCachedRandom(cacheKey)
  console.log(`after cached fetch - ${label}`)
  return (
    <dl>
      <dt>Cached Fetch</dt>
      <dd>{data}</dd>
    </dl>
  )
}

export async function UncachedFetch({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const response = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/random?key=${encodeURIComponent('uncached-' + cacheKey)}`
  )
  console.log(`after uncached fetch - ${label}`)
  const data = await response.text()
  return (
    <dl>
      <dt>Uncached Fetch</dt>
      <dd>{data}</dd>
    </dl>
  )
}
