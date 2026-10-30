import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'

// A partial page that links to another partial page.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Links</h1>
      <Link id="to-partial-multi" href="/partial-multi">
        To /partial-multi
      </Link>
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
