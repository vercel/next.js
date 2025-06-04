import { Suspense } from 'react'
import { headers } from 'next/headers'

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
  const hasHeader = (await headers()).has('x-sentinel')
  if (hasHeader) {
    return (
      <div>
        header{' '}
        <span id="x-sentinel">{(await headers()).get('x-sentinel')}</span>
      </div>
    )
  } else {
    return <div>no header found</div>
  }
}

function ComponentTwo() {
  return <p>footer</p>
}
