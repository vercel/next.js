export async function PrivateCachedData({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const data = await getPrivateCachedData(cacheKey)
  console.log(`after private cache read - ${label}`)
  return (
    <dl>
      <dt>Private Cached Data (Page)</dt>
      <dd>{data}</dd>
    </dl>
  )
}

async function getPrivateCachedData(_key: string) {
  'use cache: private'
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
