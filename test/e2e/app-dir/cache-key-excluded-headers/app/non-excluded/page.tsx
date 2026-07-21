// Tests that a header NOT in cacheKeyExcludedHeaders still participates in
// the cache key.  Two fetches to the same URL with different x-custom values
// should produce *different* random values (cache MISS on the second fetch).
export default async function Page() {
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { 'x-custom': 'val-aaa' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { 'x-custom': 'val-bbb' },
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
