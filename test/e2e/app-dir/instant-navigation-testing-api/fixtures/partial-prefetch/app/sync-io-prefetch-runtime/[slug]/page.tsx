import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function SyncIOPrefetchRuntimePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      <h1 data-testid="sync-io-prefetch-runtime-title">
        Sync IO Prefetch Runtime
      </h1>
      <Suspense fallback={<div data-testid="cookies-fallback">Loading...</div>}>
        <RuntimeMarker />
      </Suspense>
      <Suspense
        fallback={
          <div data-testid="sync-io-prefetch-runtime-fallback">
            Loading params...
          </div>
        }
      >
        <SyncIOAfterParams params={params} />
      </Suspense>
    </div>
  )
}

async function RuntimeMarker() {
  await cookies()
  return <div data-testid="runtime-marker">runtime ready</div>
}

async function SyncIOAfterParams({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const timestamp = Date.now()
  return (
    <div data-testid="sync-io-prefetch-runtime-value">
      slug: {slug}, timestamp: {timestamp}
    </div>
  )
}
