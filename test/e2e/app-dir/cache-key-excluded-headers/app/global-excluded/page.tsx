// Tests that a header listed in experimental.cacheKeyExcludedHeaders is
// ignored when computing the fetch Data Cache key.  Two fetches to the same
// URL with *different* x-request-id values should return the same cached
// random value, proving a cache HIT.
export default async function Page() {
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { 'x-request-id': 'req-aaa' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { 'x-request-id': 'req-bbb' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="data1">{data1}</p>
      <p id="data2">{data2}</p>
    </>
  )
}
