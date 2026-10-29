import { Suspense } from 'react'
import { connection } from 'next/server'

// The hole takes 3 seconds at request time, which leaves time to change
// client state before the refresh that fills it lands.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Slow hole</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Slow />
      </Suspense>
    </main>
  )
}

async function Slow() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 3000))
  return <p id="dynamic">Now: {Date.now()}</p>
}
