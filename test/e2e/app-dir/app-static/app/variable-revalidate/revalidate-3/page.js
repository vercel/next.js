export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      next: { revalidate: 3 },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      next: { revalidate: 3 },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/revalidate-3</p>
      <p id="page-data">revalidate 3: {data}</p>
      <p id="page-data-2">revalidate 3: {data2}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
