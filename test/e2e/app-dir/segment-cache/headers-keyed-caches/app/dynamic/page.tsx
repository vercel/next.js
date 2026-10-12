import { Suspense } from 'react'
import { headers } from 'next/headers'
import { connection } from 'next/server'

export const instant = {
  unstable_samples: [{ headers: [['host', 'test-host']] }],
}
export const prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <p id="intro">This page gates its dynamic content on connection().</p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  const headersStore = await headers()
  const headerValue = headersStore.get('host') === null ? 'missing' : 'present'
  return (
    <div>
      <div id="header-value">{`Header: ${headerValue}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

// A module-level cache keyed on the identity of the headers object (like
// `dedupe()` from the Flags SDK, or any per-request memoization that treats
// the headers object as "the request"), gating its data on `connection()` so
// it only produces data during actual navigations, never during (runtime)
// prefetches.
//
// A request can be rendered by multiple passes with different semantics for
// `connection()`: the prospective and final prerenders of a runtime prefetch,
// or a navigation's dynamic render and the runtime prerender that is spawned
// from it to refresh the client's prefetch cache. In prerenders the
// connection() promise hangs and is rejected when the pass is aborted; during
// navigations it resolves. Each render pass resolves `await headers()` to a
// distinct object, which scopes identity-keyed memoization like this cache to
// a single pass: a promise created under one pass's semantics is never
// consumed by another pass.
const requestDataCache = new WeakMap<object, Promise<string>>()
async function getRequestData(): Promise<string> {
  const headersStore = await headers()
  let dataPromise = requestDataCache.get(headersStore)
  if (dataPromise === undefined) {
    dataPromise = (async () => {
      await connection()
      return 'request data'
    })()
    requestDataCache.set(headersStore, dataPromise)
  }
  return dataPromise
}

async function Dynamic() {
  const data = await getRequestData()
  return <div id="dynamic-content">Dynamic content: {data}</div>
}
