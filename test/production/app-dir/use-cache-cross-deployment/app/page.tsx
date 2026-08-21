import { Suspense } from 'react'
import { connection } from 'next/server'
import { getDate } from './logic'

async function getData() {
  'use cache: remote'

  return getDate()
}

async function AsyncComp() {
  let data = await getData()

  return <span id="data">{data}</span>
}

export default async function Home() {
  await connection()

  return (
    <main>
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncComp />
      </Suspense>
    </main>
  )
}
