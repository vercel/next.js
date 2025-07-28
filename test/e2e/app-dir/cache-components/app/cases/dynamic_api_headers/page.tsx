import { Suspense } from 'react'

import { headers } from 'next/headers'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <p>This page calls `headers()` in a child component.</p>
      <p>
        With PPR this page can be partially static because the dynamic API usage
        is inside a suspense boundary.
      </p>
      <p>
        Without PPR this page is fully dynamic because a dynamic API was used.
      </p>
      <Suspense fallback="loading...">
        <ComponentThatReadsHeaders />
      </Suspense>
      <Suspense fallback="loading too...">
        <OtherComponent />
        <div id="inner">{getSentinelValue()}</div>
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentThatReadsHeaders() {
  let sentinelHeader
  try {
    sentinelHeader = (await headers()).get('x-sentinel')
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
