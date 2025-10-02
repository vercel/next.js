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
