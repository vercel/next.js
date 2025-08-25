import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_prefetch = 'unstable_static'

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
