import { Suspense } from 'react'
import type { Metadata } from 'next'
import { connection } from 'next/server'

// The title is request-time data, so it arrives with the refresh.
export async function generateMetadata(): Promise<Metadata> {
  await connection()
  return { title: `Dynamic title ${Date.now()}` }
}

export default function Page() {
  return (
    <main>
      <h1 id="heading">Dynamic metadata</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Now />
      </Suspense>
    </main>
  )
}

async function Now() {
  await connection()
  return <p id="dynamic">Now: {Date.now()}</p>
}
