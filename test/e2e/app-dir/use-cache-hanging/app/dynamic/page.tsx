import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

// A cache fill in the Dynamic stage (after `connection()`) should not be
// subject to the dev fill timeout. This mirrors prerender, where caches
// past `connection()` aren't executed at all and therefore not subject to
// the timeout handling either. The sleep is intentionally longer than the
// 50s timeout so the test fails if the timer isn't cleared.
async function Cached(): Promise<ReactNode> {
  'use cache'

  await new Promise((resolve) => setTimeout(resolve, 52_000))

  return <p id="cached">cached</p>
}

async function Dynamic(): Promise<ReactNode> {
  await connection()

  return <Cached />
}

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <Dynamic />
    </Suspense>
  )
}
