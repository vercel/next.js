import { Suspense } from 'react'
import { io } from 'next/cache'
import { getSentinelValue } from '../getSentinelValue'

export default function Page() {
  return (
    <>
      <p>
        This page uses io() inside a "use cache" function. Inside cache scopes
        io() resolves immediately so the cached value should be computed at
        cache-fill time during the build.
      </p>
      <Suspense fallback="loading...">
        <CachedComponent />
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function CachedComponent() {
  const value = await getCachedValue()
  return <div id="cached-value">{value}</div>
}

async function getCachedValue() {
  'use cache'
  await io()
  return getSentinelValue()
}
