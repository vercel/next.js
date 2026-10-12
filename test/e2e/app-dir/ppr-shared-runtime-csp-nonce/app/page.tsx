import { Suspense } from 'react'
import { connection } from 'next/server'
import { Counter } from './counter'

async function Dynamic() {
  await connection()
  return <p id="dynamic">dynamic</p>
}

// A static shell with a dynamic hole: prerendered with a postponed state and
// resumed per request.
export default function Page() {
  return (
    <main>
      <h1 id="shell">shell</h1>
      <Counter />
      <Suspense fallback={<p id="fallback">loading</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
