import { unstable_noStore as noStore } from 'next/cache'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `unstable_noStore()` in a child component without a
        parent Suspense boundary
      </p>
      <p>
        With PPR this page has an empty shell because the dynamic API usage is
        not inside a Suspense boundary.
      </p>
      <p>
        Without PPR this page is fully dynamic because a dynamic API was used.
      </p>
      <ComponentThatCallsNoStore />
      <OtherComponent />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentThatCallsNoStore() {
  try {
    noStore()
  } catch (e) {
    // swallow any throw. We still want to ensure this is dynamic
  }
  return <div>This component called unstable_noStore()</div>
}

async function OtherComponent() {
  return <div>This component didn't call unstable_noStore()</div>
}
