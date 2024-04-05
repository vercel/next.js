export const dynamic = 'force-dynamic'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      cache: 'no-store',
      next: { tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      cache: 'no-store',
      next: { tags: ['thankyounext', 'justputit'] },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page-data">data: {data}</p>
      <p id="page-data-2">data: {data2}</p>
    </>
  )
}
