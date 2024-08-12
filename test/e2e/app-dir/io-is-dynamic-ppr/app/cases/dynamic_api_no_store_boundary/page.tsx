import { Suspense } from 'react'

import { unstable_noStore as noStore } from 'next/cache'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `unstable_noStore()` in a child component but because
        this component is inside a Suspense boundary the shell is still static.
      </p>
      <Suspense fallback="loading...">
        <ComponentThatCallsNoStore />
      </Suspense>
      <Suspense fallback="loading too...">
        <OtherComponent />
      </Suspense>
      <div id="page">{process.env.__TEST_SENTINEL}</div>
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
