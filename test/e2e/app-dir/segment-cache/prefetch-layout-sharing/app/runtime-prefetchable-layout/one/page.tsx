import { Suspense } from 'react'
import { cachedDelay } from '../../shared'
import { cookies } from 'next/headers'

export default function Page() {
  return (
    <main>
      <h1 style={{ color: 'yellow' }}>Page one</h1>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? null
  await cachedDelay([__filename, cookieValue])
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="cookie-value-page">{`Cookie from page: ${cookieValue}`}</div>
      {/*
        TODO: a runtime-prefetched layout that had no holes itself will still be considered partial
        if any other segment in the response is partial, because we don't track partiality per-segment,
        so if we want to test that full prefetches can reuse layouts from runtime prefetches,
        the whole page needs to be dynamically prerenderable.
       */}
      {/* <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense> */}
    </div>
  )
}
