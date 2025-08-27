import { unstable_cacheLife as cacheLife } from 'next/cache'
import { Suspense } from 'react'

async function getCachedRandom() {
  'use cache'
  cacheLife('frequent')
  return Math.random()
}

async function DynamicCache() {
  'use cache'
  cacheLife('seconds')
  return <p id="y">{new Date().toISOString()}</p>
}

export default async function Page() {
  const x = await getCachedRandom()

  return (
    <>
      <p id="x">{x}</p>
      <Suspense fallback={<p id="y">Loading...</p>}>
        <DynamicCache />
      </Suspense>
    </>
  )
}
