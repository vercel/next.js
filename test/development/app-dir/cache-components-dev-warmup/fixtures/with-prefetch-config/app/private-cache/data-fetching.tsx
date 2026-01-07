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

export async function SuccessivePrivateCachedData({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  // This components tests if we correctly handle the case where resolving a cache
  // reveals another cache in the children. When we're filling caches, we should fill both.
  const data1 = await getPrivateCachedData(`${cacheKey}-successive-1`)
  return (
    <dl>
      <dt>Private Cached Data (successive reads)</dt>
      <dd>{data1}</dd>
      <dd>
        <SuccessivePrivateCachedDataChild label={label} cacheKey={cacheKey} />
      </dd>
    </dl>
  )
}

async function SuccessivePrivateCachedDataChild({
  label,
  cacheKey,
}: {
  label: string
  cacheKey: string
}) {
  const data2 = await getPrivateCachedData(`${cacheKey}-successive-2`)
  console.log(`after successive private cache reads - ${label}`)
  return <>{data2}</>
}

async function getPrivateCachedData(_key: string) {
  'use cache: private'
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
