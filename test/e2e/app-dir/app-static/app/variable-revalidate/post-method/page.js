export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/post-method</p>
      <p id="page-data">{data}</p>
    </>
  )
}
