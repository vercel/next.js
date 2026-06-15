import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Cached() {
  'use cache'
  await setTimeout(1000)
  return <p id="cached">{new Date().toISOString()}</p>
}

function SyncIO() {
  return <p id="sync">{Date()}</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="loading">Loading...</p>}>
        <Cached />
      </Suspense>
      <SyncIO />
    </main>
  )
}
