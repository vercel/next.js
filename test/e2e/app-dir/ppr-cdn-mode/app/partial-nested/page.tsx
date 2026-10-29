import { Suspense } from 'react'
import { connection } from 'next/server'

// The outer boundary completes in the shell; the inner one is a hole.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Nested hole</h1>
      <Suspense fallback={<p id="fallback-outer">Loading outer…</p>}>
        <section>
          <p id="static-outer">Outer content</p>
          <Suspense fallback={<p id="fallback-inner">Loading inner…</p>}>
            <Now />
          </Suspense>
        </section>
      </Suspense>
    </main>
  )
}

async function Now() {
  await connection()
  return <p id="dynamic">Now: {Date.now()}</p>
}
