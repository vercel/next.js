import { headers } from 'next/headers'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `headers()` in a child component without a parent
        Suspense boundary
      </p>
      <p>
        With PPR this page has an empty shell because the dynamic API usage is
        not inside a Suspense boundary.
      </p>
      <p>
        Without PPR this page is fully dynamic because a dynamic API was used.
      </p>
      <ComponentThatReadsHeaders />
      <OtherComponent />
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
