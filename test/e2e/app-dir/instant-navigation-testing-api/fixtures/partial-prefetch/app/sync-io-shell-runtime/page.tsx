import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function SyncIOShellRuntimePage() {
  return (
    <div>
      <h1 data-testid="sync-io-shell-runtime-title">Sync IO Shell Runtime</h1>
      <Suspense
        fallback={
          <div data-testid="sync-io-shell-runtime-fallback">
            Loading cookies...
          </div>
        }
      >
        <SyncIOAfterCookies />
      </Suspense>
    </div>
  )
}

async function SyncIOAfterCookies() {
  await cookies()
  const timestamp = Date.now()
  return (
    <div data-testid="sync-io-shell-runtime-value">timestamp: {timestamp}</div>
  )
}
