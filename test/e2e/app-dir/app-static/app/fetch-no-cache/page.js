export default async function Page() {
  const dataNoCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a2',
    {
      cache: 'no-cache',
    }
  ).then((res) => res.text())

  const dataForceCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b3',
    {
      cache: 'force-cache',
    }
  ).then((res) => res.text())

  const dataRevalidateCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?c4',
    {
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  const dataRevalidateAndFetchCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?d5',
    {
      next: {
        revalidate: 3,
      },
      cache: 'force-cache',
    }
  ).then((res) => res.text())

  const dataAutoCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?d6'
  ).then((res) => res.text())

  return (
    <>
      <p>/fetch-no-cache</p>
      <p id="data-no-cache">"cache: no-cache" {dataNoCache}</p>
      <p id="data-force-cache">"cache: force-cache" {dataForceCache}</p>
      <p id="data-revalidate-cache">"revalidate: 3" {dataRevalidateCache}</p>
      <p id="data-revalidate-and-fetch-cache">
        "revalidate: 3 and cache: force-cache" {dataRevalidateAndFetchCache}
      </p>
      <p id="data-auto-cache">"auto cache" {dataAutoCache}</p>
    </>
  )
}
