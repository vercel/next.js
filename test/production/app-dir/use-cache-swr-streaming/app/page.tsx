import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function Cached() {
  'use cache'

  cacheLife('seconds')

  return <p id="cached">{new Date().toISOString()}</p>
}

async function Streamed() {
  await setTimeout(1000)

  return <Cached />
}

export default async function Page() {
  await connection()

  return (
    <>
      <p id="dynamic">{new Date().toISOString()}</p>
      <Suspense fallback={<p>Loading...</p>}>
        <Streamed />
      </Suspense>
    </>
  )
}
