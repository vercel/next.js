import { Suspense } from 'react'
import { connection } from 'next/server'
import { notFound } from 'next/navigation'

// The hole calls notFound() at request time.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Not found in a hole</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Missing />
      </Suspense>
    </main>
  )
}

async function Missing(): Promise<never> {
  await connection()
  notFound()
}
