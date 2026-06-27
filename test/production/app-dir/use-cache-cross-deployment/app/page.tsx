import { Suspense } from 'react'
import { connection } from 'next/server'
import { getDate } from './logic'

async function getData() {
  'use cache: remote'

  return getDate()
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
