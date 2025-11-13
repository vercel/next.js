import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind, uncachedIO } from '../../../../shared'
import { connection } from 'next/server'

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
        This page uses params (passed to a private cache) and some uncached IO,
        so parts of it should be runtime-prefetchable.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable params={params} />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable({ params }: { params: Promise<Params> }) {
  const id = await privateCache(params)
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="param-value">{`Param: ${id}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function privateCache(params: Promise<Params>) {
  'use cache: private'
  const { id } = await params
  await cachedDelay([__filename, id])
  return id
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
