export const revalidate = 3

export const metadata = {
  title: 'Cache Test',
}

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: {
        revalidate: 9,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p>/variable-config-revalidate/revalidate-3</p>
      <p id="date">{Date.now()}</p>
      <p id="random-data">{data}</p>
    </>
  )
}
