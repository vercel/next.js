import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Cached() {
  'use cache'
  await setTimeout(2000)
  return <p id="cached">{new Date().toISOString()}</p>
}

export default async function Page() {
  return (
    <Suspense fallback={<p id="cached-fallback">Loading...</p>}>
      <Cached />
    </Suspense>
  )
}
