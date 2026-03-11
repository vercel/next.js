// This repros a bug from https://github.com/vercel/next.js/issues/86662.
// The bug from occurs if we have:
// - a cache (which requires warming = a restart in dev)
// - a dynamic function (blocked until the dynamic stage, like an uncached fetch)
//   that dedupes concurrent calls. note that that's not quite the same as caching it,
//   because it gets dropped after finishing.

import { Suspense } from 'react'

export default async function Page() {
  return (
    <main>
      <Suspense fallback={<div>Loading...</div>}>
        <div id="random">
          <DynamicRandom />
        </div>
      </Suspense>
    </main>
  )
}

async function DynamicRandom() {
  const [, random] = await Promise.all([
    // ensure that there's a restart to warm this cache.
    cached(),
    // This fetch going to be blocked on the dynamic stage.
    // That promise should be rejected when restarting.
    // If it's not rejected (like it wasn't before the fix),
    // it'll remain hanging, and we'll never render anything.
    fetchDynamicRandomDeduped(),
  ])
  return random
}

function dedupeConcurrent<T>(func: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    if (pending !== null) {
      console.log('dedupe :: re-using pending promise')
      return pending
    }

    console.log('dedupe :: starting')
    const promise = func()
    pending = promise

    const clearPending = () => {
      console.log('dedupe :: finished')
      pending = null
    }
    promise.then(clearPending, clearPending)

    return promise
  }
}

const fetchDynamicRandomDeduped = dedupeConcurrent(async () => {
  const res = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  )
  if (!res.ok) {
    throw new Error(`request failed with status ${res.status}`)
  }
  const text = await res.text()
  return text
})

async function cached() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve))
}
