import { fetchRetry } from '../../../lib/fetch-retry'

export const revalidate = 3

export async function generateStaticParams() {
  return [{ slug: 'one' }]
}

export default async function page({ params }) {
  const { slug } = params
  let data

  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    data = await fetchRetry(
      'https://next-data-api-endpoint.vercel.app/api/random',
      {
        headers: {
          Authorization: 'Bearer my-token',
        },
      }
    ).then((res) => res.text())
  }

  return (
    <>
      <p id="page">/gen-params-dynamic/[slug]</p>
      <p id="slug">{slug}</p>
      <p id="data">{data}</p>
    </>
  )
}
