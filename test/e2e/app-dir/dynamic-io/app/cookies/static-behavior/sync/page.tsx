import { Suspense } from 'react'
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  // We delay rendering so that metadata can be resolved first
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
