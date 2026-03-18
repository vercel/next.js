import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'
import { Suspense } from 'react'

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
  cacheLife({ stale: 120 })
  return <p id="cached-content">Cached content ({new Date().toISOString()})</p>
}

async function ParamsContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  // When the param is a fallback param (not in generateStaticParams), the
  // await is deferred to the runtime stage, so this content won't appear
  // in the static stage.
  const { slug } = await params
  await setTimeout(300)
  return <p>Param: {slug}</p>
}

async function ConnectionContent() {
  await connection()
  await setTimeout(600)
  return <p>Dynamic content ({new Date().toISOString()})</p>
}
