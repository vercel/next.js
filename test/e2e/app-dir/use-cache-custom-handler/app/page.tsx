import { Suspense } from 'react'
import { unstable_cacheLife as cacheLife } from 'next/cache'

async function getData() {
  'use cache'
  cacheLife({
    revalidate: 3,
  })
  return Math.random()
}

async function AsyncComp() {
  let data = await getData()
  return <p id="data">{data}</p>
}

export default function Home() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <AsyncComp />
      </Suspense>
    </main>
  )
}
