import { connection } from 'next/server'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function SlowCached() {
  'use cache'
  // A long-running cache fill. The dynamic sibling below must not wait for it.
  await setTimeout(5000)
  return <p id="cached">{new Date().toISOString()}</p>
}

async function Dynamic() {
  await connection()
  return <p id="dynamic">dynamic content</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="cached-fallback">Loading cache...</p>}>
        <SlowCached />
      </Suspense>
      <Suspense fallback={<p id="dynamic-fallback">Loading dynamic...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
