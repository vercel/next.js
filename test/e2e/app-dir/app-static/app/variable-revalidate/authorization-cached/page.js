export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: {
        Authorization: 'Bearer token',
      },
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/authorization-cached</p>
      <p id="page-data">{data}</p>
    </>
  )
}
