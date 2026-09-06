import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Cached() {
  'use cache'
  await setTimeout(1000)
  return <p id="cached">{new Date().toISOString()}</p>
}

async function UncachedIO() {
  await setTimeout(100)
  return <p id="uncached">uncached</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="loading">Loading...</p>}>
        <Cached />
      </Suspense>
      <UncachedIO />
    </main>
  )
}
