import { Suspense } from 'react'
import { unstable_cache as cache } from 'next/cache'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page renders two components. The first calls a simulated IO
        function wrapped in `unstable_cache`. The second calls the simulated IO
        function without being wrapped in `unstable_cache`.
      </p>
      <p>Each component is wrapped in a Suspense boundary</p>
      <p>
        With PPR this page should have a static shell that includes the cached
        IO result and a loading state for the boundary surrounding the uncached
        IO result.
      </p>
      <p>Without PPR this page should be dynamic.</p>
      <Suspense fallback="loading...">
        <ComponentOne />
      </Suspense>
      <Suspense fallback="loading too...">
        <ComponentTwo />
        <div id="inner">{getSentinelValue()}</div>
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentOne() {
  return <div>message 1: {await getCachedMessage('hello cached fast', 2)}</div>
}

async function ComponentTwo() {
  return (
    <>
      <div>message 2: {await getMessage('hello uncached fast', 0)}</div>
      <div>message 3: {await getCachedMessage('hello cached slow', 20)}</div>
    </>
  )
}

async function getMessage(echo, delay) {
  await new Promise((r) => setTimeout(r, delay))
  return echo
}

const getCachedMessage = cache(getMessage)
