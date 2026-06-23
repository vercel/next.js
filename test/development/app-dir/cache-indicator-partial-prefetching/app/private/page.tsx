import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

// Runtime-prefetchable: a client navigation reveals the runtime shell, and a
// private cache resolves in the session-data (runtime) stage, so it's part of
// the runtime shell for a dev client navigation.
export const prefetch = 'allow-runtime'

async function PrivateData() {
  'use cache: private'
  await setTimeout(1500)
  return <p id="private">{new Date().toISOString()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p id="private-fallback">Loading...</p>}>
      <PrivateData />
    </Suspense>
  )
}
