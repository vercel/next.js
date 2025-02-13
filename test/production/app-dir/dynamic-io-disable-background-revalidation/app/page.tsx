'use cache'
import { unstable_cacheLife } from 'next/cache'
import React, { Suspense } from 'react'

async function getRandom() {
  'use cache'
  unstable_cacheLife('hours')
  return Math.random()
}

export default async function Page() {
  unstable_cacheLife({ stale: 0, revalidate: 1 })
  return (
    <>
      <p>index page</p>
      <p id="inline-random">{new Date().toISOString()}</p>
      <Suspense fallback={<p>loading...</p>}>
        <p id="random-cached">{getRandom()}</p>
      </Suspense>
    </>
  )
}
