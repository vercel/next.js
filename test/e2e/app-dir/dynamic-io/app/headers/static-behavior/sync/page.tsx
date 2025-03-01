import { Suspense } from 'react'
import { headers, type UnsafeUnwrappedHeaders } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'
/**
 * This test case is constructed to demonstrate the deopting behavior of synchronously
 * accesing dynamic data like headers. <ComponentTwo /> won't be able to render before we abort
 */
export default async function Page() {
  // We introduce a delay to allow metadata to resolve fully
  await new Promise((r) => process.nextTick(r))
  return (
    <Suspense fallback="loading...">
      <Suspense fallback="inner loading...">
        <Component />
      </Suspense>
      <ComponentTwo />
      <div id="page">{getSentinelValue()}</div>
    </Suspense>
  )
}

function Component() {
  const _headers = headers() as unknown as UnsafeUnwrappedHeaders
  const hasHeader = _headers.has('x-sentinel')
  if (hasHeader) {
    return (
      <div>
        header <span id="x-sentinel">{_headers.get('x-sentinel')}</span>
      </div>
    )
  } else {
    return <div>no header found</div>
  }
}

function ComponentTwo() {
  return <p>footer</p>
}
