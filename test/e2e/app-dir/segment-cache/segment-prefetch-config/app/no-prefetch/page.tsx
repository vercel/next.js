import { connection } from 'next/server'
import { Suspense } from 'react'

// No exported prefetch value.
// export const unstable_prefetch = ...

export default function Page() {
  return (
    <main>
      <h1>A page that should use a static prefetch</h1>
      <Suspense fallback="Loading...">
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div>Dynamic content</div>
}
