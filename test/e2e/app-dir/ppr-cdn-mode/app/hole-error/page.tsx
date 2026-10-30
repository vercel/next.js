import { Suspense } from 'react'
import { connection } from 'next/server'

// The hole throws at request time.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Error in a hole</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Fail />
      </Suspense>
    </main>
  )
}

async function Fail(): Promise<never> {
  await connection()
  throw new Error('The hole failed')
}
