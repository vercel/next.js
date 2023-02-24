export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: {
        // revalidate 3 is overridden by cookie header here
        cookie: 'authorized=true',
      },
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/cookie-cached</p>
      <p id="page-data">{data}</p>
    </>
  )
}
