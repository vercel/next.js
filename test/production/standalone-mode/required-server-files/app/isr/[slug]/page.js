export const revalidate = 3

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default async function Page({ params }) {
  console.log('rendering /isr/[slug]')

  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: {
        tags: ['isr-page'],
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/isr/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
      <p id="now">{Date.now()}</p>
      <p id="data">{data}</p>
    </>
  )
}
