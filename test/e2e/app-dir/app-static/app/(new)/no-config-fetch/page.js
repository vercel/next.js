export default async function Page() {
  const data = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/random`
  ).then((res) => res.text())

  return (
    <>
      <p>/no-config-fetch</p>
      <p id="data">{data}</p>
    </>
  )
}
