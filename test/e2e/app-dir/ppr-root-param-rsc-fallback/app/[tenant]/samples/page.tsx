import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'

async function CachedShell({ tenant }: { tenant: string }) {
  'use cache'

  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  })
  cacheTag(`sample-shell:${tenant}`)

  return (
    <>
      <p id="cached-tenant">
        Tenant: <strong>{tenant}</strong>
      </p>
      <p id="cached-at">
        Cached shell token: <strong>{crypto.randomUUID()}</strong>
      </p>
    </>
  )
}

async function DynamicRequestContent({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant } = await params

  await connection()

  return (
    <p id="dynamic">
      Request-time content for <strong>{tenant}</strong>.
    </p>
  )
}

export default function SamplesPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const shell = params.then(async ({ tenant }) => (
    <CachedShell tenant={tenant} />
  ))

  return (
    <main>
      <h1>Samples Route</h1>
      <Suspense fallback={<p id="shell-fallback">Loading cached shell...</p>}>
        {shell}
      </Suspense>
      <Suspense fallback={<p id="fallback">Loading request-time content...</p>}>
        <DynamicRequestContent params={params} />
      </Suspense>
    </main>
  )
}
