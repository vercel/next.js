import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

// Runtime-prefetchable: a client navigation reveals the runtime shell.
export const prefetch = 'allow-runtime'

async function getCachedValue() {
  'use cache'
  await setTimeout(1500)
  return new Date().toISOString()
}

async function ParamsData({ params }: { params: Promise<{ id: string }> }) {
  // Awaiting params (without generateStaticParams) is what defers the cache
  // read past the static shell.
  await params
  const value = await getCachedValue()
  return <p id="params">{value}</p>
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p id="params-fallback">Loading...</p>}>
      <ParamsData params={params} />
    </Suspense>
  )
}
