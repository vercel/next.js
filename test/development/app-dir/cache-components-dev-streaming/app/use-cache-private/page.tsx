import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function PrivateCached() {
  'use cache: private'
  await setTimeout(1500)
  return <p id="private">{new Date().toISOString()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p id="private-fallback">Loading...</p>}>
      <PrivateCached />
    </Suspense>
  )
}
