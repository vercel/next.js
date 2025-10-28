import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind, uncachedIO } from '../../../shared'
import { connection } from 'next/server'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ searchParams: { key: 'value' } }],
}

type AnySearchParams = { [key: string]: string | string[] | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  return (
    <main>
      <DebugRenderKind />
      <p>
        This page uses search params (passed to a private cache) and some
        uncached IO, so parts of it should be runtime-prefetchable.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  const searchParam = await privateCache(searchParams)
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="search-param-value">{`Search param: ${searchParam}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function privateCache(searchParams: Promise<AnySearchParams>) {
  'use cache: private'
  const { searchParam } = await searchParams
  await cachedDelay([__filename, searchParam])
  return searchParam
}

async function Dynamic() {
  await uncachedIO()
  await connection()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div id="dynamic-content">Dynamic content</div>
    </div>
  )
}
