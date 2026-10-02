import { cacheLife } from 'next/cache'

// Cache Components requires a build-time sample. /1 is not among the samples,
// so its full route entry is still generated on demand.
export function generateStaticParams() {
  return [{ id: 'prerendered' }]
}

async function CachedPage({ id }: { id: string }) {
  'use cache'
  const serviceUrl = process.env.CACHE_LIFE_SERVICE_URL
  const result: { message: string; revalidate: number } =
    serviceUrl && id !== 'prerendered'
      ? await (await fetch(serviceUrl)).json()
      : { message: 'success', revalidate: 3600 }

  cacheLife({ stale: 300, revalidate: result.revalidate, expire: 7200 })
  return (
    <>
      <p id="page">page {id}</p>
      <p id="result">{result.message}</p>
    </>
  )
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CachedPage id={id} />
}
