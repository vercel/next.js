import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

export const prefetch = 'allow-runtime'

async function getCachedValue(id: string) {
  'use cache'
  await setTimeout(1500)
  return `${id}: new Date().toISOString()`
}

async function LinkData({ params }: { params: Promise<{ id: string }> }) {
  // Awaiting params defers the cache read past the app shell, so it
  // should only trigger a cold cache indicator in a speculative prefetch.
  const { id } = await params
  const value = await getCachedValue(id)
  return <p id="params">{value}</p>
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p id="params-fallback">Loading...</p>}>
      <LinkData params={params} />
    </Suspense>
  )
}
