// we want to bail out of ISR, but still leverage fetch caching
export const dynamic = 'force-dynamic'

export default async function Page() {
  const dataForceCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b2',
    {
      cache: 'force-cache',
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p>/force-cache-revalidate</p>
      <p id="data-force-cache">
        "cache: no-cache, revalidate: 3" {dataForceCache}
      </p>
    </>
  )
}
