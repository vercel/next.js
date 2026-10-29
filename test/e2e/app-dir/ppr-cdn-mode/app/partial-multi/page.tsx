import { Suspense } from 'react'
import { connection } from 'next/server'

// Two sibling holes, and a third hole nested inside the second.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Multiple holes</h1>
      <Suspense fallback={<p id="fallback-a">Loading a…</p>}>
        <Dynamic id="dynamic-a" />
      </Suspense>
      <Suspense fallback={<p id="fallback-b">Loading b…</p>}>
        <Outer />
      </Suspense>
    </main>
  )
}

async function Dynamic({ id }: { id: string }) {
  await connection()
  return <p id={id}>Now: {Date.now()}</p>
}

async function Outer() {
  await connection()
  return (
    <section>
      <p id="dynamic-b">Now: {Date.now()}</p>
      <Suspense fallback={<p id="fallback-nested">Loading nested…</p>}>
        <Nested />
      </Suspense>
    </section>
  )
}

async function Nested() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <p id="dynamic-nested">Nested: {Date.now()}</p>
}
