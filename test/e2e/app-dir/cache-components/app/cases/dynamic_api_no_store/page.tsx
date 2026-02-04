import { Suspense } from 'react'

import { unstable_noStore as noStore } from 'next/cache'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  // We wait for metadata to finish before rendering this component which will trigger
  // a synchronous abort
  await new Promise((r) => process.nextTick(r))
  return (
    <>
      <p>
        This page calls `unstable_noStore()` in a child component with a parent
        Suspense boundary.
      </p>
      <p>
        With PPR this page can be partially static because the dynamic API usage
        is inside a suspense boundary.
      </p>
      <p>
        Without PPR this page is fully dynamic because a dynamic API was used.
      </p>
      <Suspense fallback="loading...">
        <ComponentThatCallsNoStore />
      </Suspense>
      <Suspense fallback="loading too...">
        <OtherComponent />
        <div id="inner">{getSentinelValue()}</div>
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentThatCallsNoStore() {
  try {
    noStore()
  } catch (e) {
    // swallow any throw. We should still not be static
  }
  return <div>This component called unstable_noStore()</div>
}

async function OtherComponent() {
  return <div>This component didn't call unstable_noStore()</div>
}
