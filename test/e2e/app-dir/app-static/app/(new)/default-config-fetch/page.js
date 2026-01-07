export default async function Page() {
  const data = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/random`,
    { cache: 'default' }
  ).then((res) => res.text())

  return (
    <>
      <p>/default-config-fetch</p>
      <p id="data">{data}</p>
    </>
  )
}
