import { Suspense } from 'react'
import { connection } from 'next/server'

// Like /partial-nested, but the outer content waits on cached I/O, so React
// writes it as a separate segment that a script reveals. The inner hole sits
// inside that segment.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Nested hole in an async segment</h1>
      <Suspense fallback={<p id="fallback-outer">Loading outer…</p>}>
        <Outer />
      </Suspense>
    </main>
  )
}

async function getOuterText() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 50))
  return 'Outer content'
}

async function Outer() {
  const text = await getOuterText()
  return (
    <section>
      <p id="static-outer">{text}</p>
      <Suspense fallback={<p id="fallback-inner">Loading inner…</p>}>
        <Now />
      </Suspense>
    </section>
  )
}

async function Now() {
  await connection()
  return <p id="dynamic">Now: {Date.now()}</p>
}
