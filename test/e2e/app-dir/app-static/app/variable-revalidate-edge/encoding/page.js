export const runtime = 'experimental-edge'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/utf8-encoding',
    {
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate-edge/encoding</p>
      <p id="page-data">{data}</p>
    </>
  )
}
