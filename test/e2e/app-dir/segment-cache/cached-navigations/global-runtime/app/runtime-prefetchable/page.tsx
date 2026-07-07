import { cookies, headers } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

// Note: intentionally no `export const prefetch = 'allow-runtime'` and no
// `instant` config. This route gets runtime-cached purely because of the global
// `cachedNavigations: 'allow-runtime'` config in next.config.ts.

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return (
    <main>
      <CachedContent />
      <div id="search-params-boundary">
        <Suspense fallback={<p>Loading search params...</p>}>
          <SearchParamsContent searchParams={searchParams} />
        </Suspense>
      </div>
      <div id="cookies-boundary">
        <Suspense fallback={<p>Loading cookies...</p>}>
          <CookiesContent />
        </Suspense>
      </div>
      <div id="headers-boundary">
        <Suspense fallback={<p>Loading headers...</p>}>
          <HeadersContent />
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
  return <p id="cached-content">Cached content</p>
}

async function SearchParamsContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return <p>Search params: {q ?? 'none'}</p>
}

async function CookiesContent() {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return <p>Cookie: {value}</p>
}

async function HeadersContent() {
  const headerStore = await headers()
  const value = headerStore.get('x-test-header') ?? 'none'
  return <p>Header: {value}</p>
}

async function ConnectionContent() {
  await connection()
  return <p>Dynamic content</p>
}
