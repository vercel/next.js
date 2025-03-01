import { Suspense } from 'react'
import { cookies } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'
/**
 * This test case is constructed to demonstrate how using the async form of cookies can lead to a better
 * prerender with dynamic IO when PPR is on. There is no difference when PPR is off. When PPR is on the second component
 * can finish rendering before the prerender completes and so we can produce a static shell where the Fallback closest
 * to Cookies access is read
 */
export default async function Page() {
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

async function Component() {
  const cookie = (await cookies()).get('x-sentinel')
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
