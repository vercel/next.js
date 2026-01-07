export const revalidate = 3

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: {
        cookie: 'authorized=true',
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/cookie</p>
      <p id="page-data">{data}</p>
    </>
  )
}
