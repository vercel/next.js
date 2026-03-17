import React from 'react'
import { notFound } from 'next/navigation'

// cacheComponents requires at least one static param for build-time validation.
// The actual test paths ('trigger-not-found', 'valid') are rendered dynamically.
export function generateStaticParams() {
  return [{ id: '_warmup' }]
}

async function getCachedItem(): Promise<string> {
  'use cache'

  // TEST-ONLY: barrier to let the test orchestrate concurrent requests precisely.
  // This shared state is intentionally global and must not be used in production code.
  const g = globalThis as any
  const barrier = g.__notFoundRaceBarrier
  if (barrier) {
    barrier.enteredCount++
    await barrier.promise
  }

  // TEST-ONLY: shared flag to control notFound() behavior without affecting the cache
  // key (getCachedItem has no args so all routes share the same cache key).
  // Only A's execution reads this flag; B is expected to observe the in-flight cache
  // population rather than independently executing this body.
  const shouldNotFound = g.__notFoundRaceShouldNotFound ?? false
  g.__notFoundRaceShouldNotFound = false

  if (shouldNotFound) {
    notFound()
  }

  return 'item-content'
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Set flag only for the 'trigger-not-found' path
  if (id === 'trigger-not-found') {
    ;(globalThis as any).__notFoundRaceShouldNotFound = true
  }

  const content = await getCachedItem()
  return (
    <div>
      <div id="content">{content}</div>
    </div>
  )
}
