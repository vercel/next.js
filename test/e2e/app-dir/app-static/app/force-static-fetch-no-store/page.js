export const dynamic = 'force-static'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      cache: 'no-store',
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      next: {
        revalidate: 0,
      },
    }
  ).then((res) => res.text())

  const data3 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      cache: 'no-cache',
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/force-static-fetch-no-store</p>
      <p id="page-data">{data}</p>
      <p id="page-data2">{data2}</p>
      <p id="page-data3">{data3}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
