import React, { Suspense } from 'react'
import { connection } from 'next/server'

import { cacheTag } from 'next/cache'
import { getSentinelValue } from './sentinel'

async function getCachedTimestamp() {
  'use cache'
  cacheTag('test')
  return `${getSentinelValue()}-${Date.now()}`
}

async function DynamicComponent() {
  await connection()
  return null
}

export default async function Page() {
  const timestamp = await getCachedTimestamp()
  const randomNumber = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { cache: 'force-cache', next: { tags: ['test'] } }
  ).then((res) => res.text())
  return (
    <>
      <p id="timestamp">{timestamp}</p>
      <p id="random-number">{randomNumber}</p>
      <Suspense>
        <DynamicComponent />
      </Suspense>
    </>
  )
}
