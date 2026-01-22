import React, { Suspense } from 'react'
import { cacheTag } from 'next/cache'
import { refreshAction } from '../actions'

async function getCachedRandomNumber() {
  'use cache'
  cacheTag('server-action-test')

  await new Promise((resolve) => setTimeout(resolve, 100))

  return Math.random()
}

async function getUncachedRandomNumber() {
  // No 'use cache' - this will generate a new value on every render
  await new Promise((resolve) => setTimeout(resolve, 100))
  return Math.random()
}

async function DynamicComponent() {
  const uncachedNumber = await getUncachedRandomNumber()
  return <p id="uncached-random">{uncachedNumber}</p>
}

export default async function Page() {
  const cachedNumber = await getCachedRandomNumber()
  return (
    <>
      <p id="cached-random">{cachedNumber}</p>
      <form action={refreshAction}>
        <button id="refresh-button" type="submit">
          Refresh
        </button>
      </form>
      <Suspense fallback={<p id="uncached-random">Loading...</p>}>
        <DynamicComponent />
      </Suspense>
    </>
  )
}
