export const dynamic = 'force-dynamic'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { cache: 'force-cache' }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/force-dynamic-fetch-cache/force-cache</p>
      <p id="data">{data}</p>
    </>
  )
}
