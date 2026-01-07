import React, { Suspense } from 'react'
import { connection } from 'next/server'

import { cacheTag } from 'next/cache'

async function getRandomNumber() {
  'use cache'
  cacheTag('test')
  return Math.random()
}

async function DynamicComponent() {
  await connection()
  return null
}

export default async function Page() {
  const randomNumber = await getRandomNumber()
  const anotherRandomNumber = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { cache: 'force-cache', next: { tags: ['test'] } }
  ).then((res) => res.text())
  return (
    <>
      <p id="random-number">{randomNumber}</p>
      <p id="another-random-number">{anotherRandomNumber}</p>
      <Suspense>
        <DynamicComponent />
      </Suspense>
    </>
  )
}
