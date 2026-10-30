import { Suspense } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'

// The hole redirects at request time.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Redirect in a hole</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Redirect />
      </Suspense>
    </main>
  )
}

async function Redirect(): Promise<never> {
  await connection()
  redirect('/static')
}
