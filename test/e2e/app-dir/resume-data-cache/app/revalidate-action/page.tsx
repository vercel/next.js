import { Suspense } from 'react'
import { connection } from 'next/server'
import { cacheTag } from 'next/cache'
import { RevalidateButton } from './revalidate-button'
import { tasky } from '../../utils'

async function getCachedRandom() {
  'use cache'
  cacheTag('revalidate-action-test')
  await tasky()
  return `cache-random-${Math.random()}`
}

async function DynamicContent() {
  // Make the page dynamic/PPR by accessing connection()
  await connection()
  // Generate uncached value after dynamic access
  const uncachedValue = Math.random()
  return <p id="uncached-value">{uncachedValue}</p>
}

export default async function Page() {
  const cachedValue = await getCachedRandom()

  return (
    <div>
      <p id="cached-value">{cachedValue}</p>
      <Suspense fallback={<p id="uncached-value">Loading...</p>}>
        <DynamicContent />
      </Suspense>
      <RevalidateButton />
    </div>
  )
}
