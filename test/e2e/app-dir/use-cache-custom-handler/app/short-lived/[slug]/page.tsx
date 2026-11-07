import { cacheLife } from 'next/cache'

async function getData() {
  'use cache'
  // Short enough to be excluded from the static shell, but long enough to
  // remain fresh across both prerenders and the requests in the test.
  cacheLife({ revalidate: 180, expire: 240 })
  return new Date().toISOString()
}

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <>
      <h1>{slug}</h1>
      <p id="short-lived">{await getData()}</p>
    </>
  )
}
