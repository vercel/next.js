export const runtime = 'experimental-edge'

export default async function Page() {
  const data = await fetch(
    new Request('https://next-data-api-endpoint.vercel.app/api/random', {
      method: 'POST',
    })
  ).then((res) => res.text())

  const data2 = await fetch(
    new URL('https://next-data-api-endpoint.vercel.app/api/random'),
    {
      method: 'POST',
      next: {
        revalidate: 0,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate-edge/post-method</p>
      <p id="page-data">{data}</p>
      <p id="page-data2">{data2}</p>
    </>
  )
}
