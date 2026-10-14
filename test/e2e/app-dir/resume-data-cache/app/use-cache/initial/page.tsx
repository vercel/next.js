import React, { Suspense } from 'react'
import { connection } from 'next/server'

import { getPhase } from '../../next-phase'
import { tasky } from '../../../utils'

async function getRandomNumber() {
  'use cache'
  // no cacheTag - this cache is not meant to be revalidated
  await tasky()
  return `cache-random-${getPhase()}-${Date.now()}-${Math.random()}`
}

async function DynamicComponent() {
  await connection()
  return null
}

export default async function Page() {
  const randomNumber = await getRandomNumber()
  return (
    <main>
      <p id="random-number">{randomNumber}</p>
      <Suspense>
        <DynamicComponent />
      </Suspense>
    </main>
  )
}
