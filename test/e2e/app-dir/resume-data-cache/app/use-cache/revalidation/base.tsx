import { Suspense } from 'react'
import { connection } from 'next/server'
import { cacheLife, cacheTag } from 'next/cache'
import { getPhase } from '../../next-phase'
import { RDCInfo } from '../../../utils'

export function createUseCacheRevalidationPage(id: string) {
  const CACHE_TAG = `test-use-cache-revalidation-${id}`

  async function getRandomNumber() {
    'use cache'
    cacheTag(CACHE_TAG)
    cacheLife('max') // avoid automatic revalidations

    await new Promise((resolve) => setTimeout(resolve, 100))

    const random = String(Math.floor(Math.random() * 10_000)).padStart(4, '0')
    return `cache-random-${getPhase()}-${Date.now()}-${random}`
  }

  async function DynamicComponent() {
    await connection()
    return null
  }

  return async function Page() {
    const randomNumber = await getRandomNumber()
    return (
      <main>
        <h1>{`use cache revalidation - ${id}`}</h1>
        {process.env.SHOW_RDC_INFO && <RDCInfo />}
        <p id="random-number">{randomNumber}</p>
        <Suspense>
          <DynamicComponent />
        </Suspense>
      </main>
    )
  }
}
