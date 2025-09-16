'use cache'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page({
  searchParams: _unused,
}: {
  searchParams: Promise<{ n: string }>
}) {
  return (
    <>
      <p>
        This page renders two components. Both call a simulated IO function. The
        whole page is wrapped in "use cache".
      </p>
      <p>Niether component is wrapped in a Suspense boundary</p>
      <p>
        With PPR this page should be entirely static because all IO is cached.
      </p>
      <p>Without PPR this page should be static because all IO is cached.</p>
      <ComponentOne />
      <ComponentTwo />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentOne() {
  return <div>message 1: {await getMessage('hello cached fast', 2)}</div>
}

async function ComponentTwo() {
  return (
    <>
      <div>message 2: {await getMessage('hello cached fast', 0)}</div>
      <div>message 3: {await getMessage('hello cached slow', 20)}</div>
    </>
  )
}

async function getMessage(echo, delay) {
  await new Promise((r) => setTimeout(r, delay))
  return echo
}
