export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page'
  ).then((res) => res.text())

  return (
    <>
      <p id="page-data">{data}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
