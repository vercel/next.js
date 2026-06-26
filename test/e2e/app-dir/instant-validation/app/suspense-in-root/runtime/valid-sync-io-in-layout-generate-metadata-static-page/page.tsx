import { cookies } from 'next/headers'
import { Suspense } from 'react'

// No unstable_instant — this page is NOT runtime-prefetchable.

async function Runtime() {
  await cookies()
  return <p>Runtime content</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <Runtime />
      </Suspense>
    </main>
  )
}
