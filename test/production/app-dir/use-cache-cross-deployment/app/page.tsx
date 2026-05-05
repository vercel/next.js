import { Suspense } from 'react'
import { connection } from 'next/server'

async function getData() {
  'use cache'

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
