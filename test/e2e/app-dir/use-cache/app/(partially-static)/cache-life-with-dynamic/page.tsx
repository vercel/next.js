import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function getCachedRandom() {
  'use cache'
  cacheLife('frequent')
  return Math.random()
}

async function DynamicCache() {
  'use cache'
  cacheLife({ revalidate: 99, expire: 299, stale: 18 })
  return <p id="y">{new Date().toISOString()}</p>
}

async function Dynamic() {
  await connection()
  return null
}

export default async function Page() {
  const x = await getCachedRandom()

  return (
    <>
      <p id="x">{x}</p>
      <Suspense fallback={<p id="y">Loading...</p>}>
        <DynamicCache />
      </Suspense>
      <Suspense>
        <Dynamic />
      </Suspense>
    </>
  )
}
