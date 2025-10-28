import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../../shared'
import { connection } from 'next/server'
import { cookies } from 'next/headers'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ params: { id: 'test' } }],
}

type Params = { id: string }

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <DebugRenderKind />
      <p>
        This page passes dynamic params to a public cache, and uses some
        uncached IO, so parts of it should be prefetchable with a runtime
        prefetch.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable params={params} />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable({ params }: { params: Promise<Params> }) {
  await cookies() // Guard from being statically prerendered, which would make the cache hang

  const id = await publicCache(params)
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="param-value">{`Param: ${id}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function publicCache(params: Promise<Params>) {
  'use cache'
  const { id } = await params
  await cachedDelay([__filename, id])
  return id
}

async function Dynamic() {
  await connection()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div id="dynamic-content">Dynamic content</div>
    </div>
  )
}
