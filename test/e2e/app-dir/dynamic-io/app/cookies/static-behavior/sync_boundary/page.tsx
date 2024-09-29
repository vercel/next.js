import { Suspense } from 'react'
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'
/**
 * This test case is constructed to demonstrate the deopting behavior of synchronously
 * accesing dynamic data like cookies. <ComponentTwo /> won't be able to render before we abort
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
  const cookie = (cookies() as unknown as UnsafeUnwrappedCookies).get(
    'x-sentinel'
  )
  if (cookie && cookie.value) {
    return (
      <div>
        cookie <span id="x-sentinel">{cookie.value}</span>
      </div>
    )
  } else {
    return <div>no cookie found</div>
  }
}

function ComponentTwo() {
  return <p>footer</p>
}
