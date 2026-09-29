import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

// A cache fill in the Dynamic stage (after `connection()`) should not be
// subject to the dev fill timeout — and the probe-watchdog is skipped for
// the same reason. Both are gated on `outerWorkUnitStore.cacheSignal` /
// the Dynamic-stage check in `generateCacheEntryImpl`. The sleep is longer
// than the 10s probe idle threshold so the test would fail if the
// watchdog were armed.
async function Cached(): Promise<ReactNode> {
  'use cache'

  await new Promise((resolve) => setTimeout(resolve, 12_000))

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
