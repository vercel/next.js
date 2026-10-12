async function getCachedData() {
  'use cache'
  await new Promise((r) => setTimeout(r))
  return Math.random()
}

export default async function Page() {
  const data = await getCachedData()
  return (
    <main>
      <p>
        This page renders cached data. The cached value must be stable across
        reloads unless this page (or the data it depends on) is edited.
      </p>
      <dl>
        <dt>Cached Data</dt>
        <dd id="cached-value">{data}</dd>
        <dt>Env</dt>
        <dd id="env-value">
          {process.env.NEXT_PUBLIC_CACHE_BUSTER ?? 'unset'}
        </dd>
      </dl>
    </main>
  )
}
