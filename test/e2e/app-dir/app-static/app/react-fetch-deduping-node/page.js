export default async function Page() {
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?1',
    {
      next: {
        revalidate: 0,
      },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?1',
    {
      next: {
        revalidate: 0,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p>/react-fetch-deduping</p>
      <p id="data-1">{data1}</p>
      <p id="data-2">{data2}</p>
    </>
  )
}
