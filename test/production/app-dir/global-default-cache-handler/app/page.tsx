import React, { Suspense } from 'react'
import { revalidate } from './actions'
import { connection } from 'next/server'

async function Random({ cached }: { cached?: boolean }) {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return (
    <>
      <p>now: {Date.now()}</p>
      <p>
        {cached ? 'cached ' : ''}random: {data}
      </p>
    </>
  )
}

async function CachedRandom() {
  'use cache'

  return <Random cached />
}

export default async function Page() {
  await connection()

  return (
    <>
      <p>index page</p>
      <Suspense fallback={<p>Loading...</p>}>
        <Random />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <CachedRandom />
      </Suspense>
      <form action={revalidate}>
        <button id="revalidate-tag" type="submit">
          Revalidate tag
        </button>
      </form>
    </>
  )
}
