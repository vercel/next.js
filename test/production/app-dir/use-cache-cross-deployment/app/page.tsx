import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'

async function getData() {
  'use cache'

  cacheLife({ revalidate: 6 })
  cacheTag('modern')

  return new Date().toISOString()
}

async function AsyncComp() {
  let data = await getData()

  return <p id="data">{data}</p>
}

export default async function Home() {
  await connection()

  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <AsyncComp />
      </Suspense>
    </main>
  )
}
