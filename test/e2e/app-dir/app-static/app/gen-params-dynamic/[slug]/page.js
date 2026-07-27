import { fetchRetry } from '../../../lib/fetch-retry'

export async function generateStaticParams() {
  return [{ slug: 'one' }]
}

export default async function page(props) {
  const params = await props.params
  const { slug } = params
  const data = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      next: {
        revalidate: 0,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/gen-params-dynamic/[slug]</p>
      <p id="slug">{slug}</p>
      <p id="data">{data}</p>
    </>
  )
}
