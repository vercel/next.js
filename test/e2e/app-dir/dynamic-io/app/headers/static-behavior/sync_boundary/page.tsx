import { Suspense } from 'react'
import { headers, type UnsafeUnwrappedHeaders } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'
/**
 * This test case is constructed to demonstrate the deopting behavior of synchronously
 * accesing dynamic data like headers. <ComponentTwo /> won't be able to render before we abort
 * to it will bubble up to the root and mark the whoe page as dynamic when PPR is one. There
 * is no real change in behavior when PPR is off.
 */
export default async function Page() {
  return (
    <>
      <Suspense fallback="loading...">
        <Component />
      </Suspense>
      <ComponentTwo />
      <div id="page">{getSentinelValue()}</div>
    </>
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
