import { Suspense } from 'react'

import { headers } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `headers()` in a child component but because this
        component is inside a Suspense boundary the shell is still static.
      </p>
      <Suspense fallback="loading...">
        <ComponentThatReadsHeaders />
      </Suspense>
      <Suspense fallback="loading too...">
        <OtherComponent />
      </Suspense>
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

async function ComponentThatReadsHeaders() {
  let sentinelHeader
  try {
    sentinelHeader = headers().get('x-sentinel')
    if (!sentinelHeader) {
      sentinelHeader = '~not-found~'
    }
  } catch (e) {
    sentinelHeader = '~thrown~'
    // swallow any throw. We should still not be static
  }
  return (
    <div>
      This component read headers: "<span id="value">{sentinelHeader}</span>"
    </div>
  )
}

async function OtherComponent() {
  return <div>This component didn't read headers</div>
}
