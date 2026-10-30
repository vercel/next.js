import { Suspense } from 'react'
import { connection } from 'next/server'
import { HoleCounter } from '../hole-counter'

// The worked example: a static heading and one hole.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Static heading</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Now />
      </Suspense>
    </main>
  )
}

async function Now() {
  await connection()
  return (
    <>
      <p id="dynamic">Now: {Date.now()}</p>
      <HoleCounter />
    </>
  )
}
