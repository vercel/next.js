export const revalidate = 0

export default async function Page({ params }) {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: {
        tags: ['ssr-page'],
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/ssr/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
      <p id="now">{Date.now()}</p>
      <p id="data">{data}</p>
    </>
  )
}
