export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: {
        Authorization: 'Bearer token',
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/authorization</p>
      <p id="page-data">{data}</p>
    </>
  )
}
