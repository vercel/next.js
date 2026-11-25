import { Suspense } from 'react'

async function getCachedData(input: string) {
  'use cache'

  return `cached data for input: ${input}`
}

async function CachedData({
  searchParams,
}: {
  searchParams: Promise<{ input?: string }>
}) {
  // Reading `searchParams` and passing the value into the cached function
  // ensures that the cache handler is only invoked at request time, and not
  // during build-time prerendering.
  const { input = 'default' } = await searchParams

  return <p>{await getCachedData(input)}</p>
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ input?: string }>
}) {
  return (
    <Suspense fallback={null}>
      <CachedData searchParams={searchParams} />
    </Suspense>
  )
}
