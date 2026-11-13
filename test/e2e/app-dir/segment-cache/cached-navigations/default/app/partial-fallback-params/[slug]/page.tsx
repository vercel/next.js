import { connection } from 'next/server'
import { Suspense } from 'react'

// Partial Prefetching embeds a runtime prefetch in navigations to this route.
export const prefetch = 'partial'

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <CachedContent />
      <div id="params-boundary">
        <Suspense fallback={<p>Loading params...</p>}>
          <ParamsContent params={params} />
        </Suspense>
      </div>
      <div id="connection-boundary">
        <Suspense fallback={<p>Loading connection...</p>}>
          <ConnectionContent />
        </Suspense>
      </div>
    </main>
  )
}

async function CachedContent() {
  'use cache'
  // Default cache life, since shells leave out entries under 5 minutes stale.
  return <p id="cached-content">Cached content</p>
}

async function ParamsContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>Param: {slug}</p>
}

async function ConnectionContent() {
  await connection()
  return <p>Dynamic content</p>
}
