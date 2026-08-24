import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife } from 'next/cache'

// A dynamic route whose cached shell is keyed on its params. The fallback
// shell prerender suspends at the shell, so no HTML fallback is emitted
// (`fallback: null`, blocking) — but per-segment prefetch payloads are still
// written and served, and their lifetime must reflect the cache lifetimes
// collected during the fallback prerender (the layout's CachedBanner).

async function Shell({
  params,
  children,
}: {
  params: Promise<{ id: string }>
  children: React.ReactNode
}) {
  'use cache'
  // Same lifetime as the layout's CachedBanner, so the concrete generated
  // path (which collects both caches) agrees with the fallback export
  // (which only collects the banner).
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 })
  const { id } = await params
  return (
    <div>
      <h1>Shell for {id}</h1>
      {children}
    </div>
  )
}

async function Dynamic() {
  const jar = await cookies()
  return <p>session: {jar.get('session')?.value ?? 'anon'}</p>
}

export async function generateStaticParams() {
  return [{ id: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <Shell params={params}>
      <Suspense fallback={<p>loading…</p>}>
        <Dynamic />
      </Suspense>
    </Shell>
  )
}
