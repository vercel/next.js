import { connection } from 'next/server'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

// Note: this is intended for partialPrefetching where
// shells can access session data, so no `export const prefetch = "allow-runtime"
// is necessary.
// If the flag is not enabled globally, opt the page in manually to excercise both codepaths.
export const prefetch = process.env.__NEXT_PARTIAL_PREFETCHING
  ? 'auto'
  : 'partial'

async function SessionData() {
  await cookies()
  return <p id="session-data">session content</p>
}

async function Dynamic() {
  await connection()
  await setTimeout(1000)
  return <p id="dynamic-data">dynamic content</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="session-fallback">Loading session...</p>}>
        <SessionData />
      </Suspense>
      <Suspense fallback={<p id="dynamic-fallback">Loading dynamic...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
