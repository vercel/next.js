import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'
import { connection } from 'next/server'
import { cookies } from 'next/headers'

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
        This page passes search params to a public cache, and uses some uncached
        IO, so parts of it should be prefetchable with a runtime prefetch.
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
  await cookies() // Guard from being statically prerendered, which would make the cache hang

  const searchParam = await publicCache(searchParams)
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="search-param-value">{`Search param: ${searchParam}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function publicCache(searchParams: Promise<AnySearchParams>) {
  'use cache'
  const { searchParam } = await searchParams
  await cachedDelay([__filename, searchParam])
  return searchParam
}

async function Dynamic() {
  await connection()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div id="dynamic-content">Dynamic content</div>
    </div>
  )
}
