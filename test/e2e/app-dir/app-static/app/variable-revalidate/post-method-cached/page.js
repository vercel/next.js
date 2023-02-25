export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/post-method-cached</p>
      <p id="page-data">{data}</p>
    </>
  )
}
