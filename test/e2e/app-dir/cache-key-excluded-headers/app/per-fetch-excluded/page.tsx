// Tests that next.cacheKeyExcludedHeaders on a per-fetch basis causes the
// specified header to be excluded from the cache key.  Two fetches with
// different x-trace values and the same per-fetch exclusion list should
// return the same cached random value (cache HIT).
export default async function Page() {
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { 'x-trace': 'trace-aaa' },
      next: {
        revalidate: 50,
        cacheKeyExcludedHeaders: ['x-trace'],
      },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { 'x-trace': 'trace-bbb' },
      next: {
        revalidate: 50,
        cacheKeyExcludedHeaders: ['x-trace'],
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="data1">{data1}</p>
      <p id="data2">{data2}</p>
    </>
  )
}
