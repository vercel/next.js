import React, { Suspense } from 'react'
import { connection } from 'next/server'

import { getPhase } from '../../next-phase'
import { RDCInfo, tasky } from '../../../utils'
import { cacheLife } from 'next/cache'

async function getRandomNumber() {
  'use cache'
  cacheLife('max') // avoid automatic revalidations
  // no cacheTag - this cache is not meant to be revalidated
  await tasky()
  const random = String(Math.floor(Math.random() * 10_000)).padStart(4, '0')
  return `cache-random-${getPhase()}-${Date.now()}-${random}`
}

async function DynamicComponent() {
  await connection()
  return null
}

export default async function Page() {
  const randomNumber = await getRandomNumber()
  return (
    <main>
      {process.env.SHOW_RDC_INFO && <RDCInfo />}
      <p id="random-number">{randomNumber}</p>
      <Suspense>
        <DynamicComponent />
      </Suspense>
    </main>
  )
}
