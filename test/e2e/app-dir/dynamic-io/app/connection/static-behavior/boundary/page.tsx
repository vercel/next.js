import { Suspense } from 'react'
import { connection } from 'next/server'

import { getSentinelValue } from '../../../getSentinelValue'
/**
 * This test case is constructed to demonstrate how using the async form of cookies can lead to a better
 * prerender with dynamic IO when PPR is on. There is no difference when PPR is off. When PPR is on the second component
 * can finish rendering before the prerender completes and so we can produce a static shell where the Fallback closest
 * to Cookies access is read
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

async function Component() {
  await connection()
  return (
    <div>
      cookie <span id="foo">foo</span>
    </div>
  )
}

function ComponentTwo() {
  return <p>footer</p>
}
