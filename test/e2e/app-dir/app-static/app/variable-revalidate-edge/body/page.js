export const runtime = 'edge'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/echo-body',
    {
      next: {
        revalidate: 3,
      },
      method: 'POST',
      duplex: 'half',
      body: JSON.stringify({ hello: 'world' }),
    }
  ).then((res) => res.json())

  return (
    <>
      <p id="page">/variable-revalidate-edge/encoding</p>
      <p id="page-data">{JSON.stringify(data)}</p>
    </>
  )
}
