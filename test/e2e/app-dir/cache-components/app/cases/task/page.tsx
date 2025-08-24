import { Suspense } from 'react'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page renders a component that requires async IO. It is simulated
        using setTimeout(f, 1000).
      </p>
      <p>
        This component simulated IO component is rendered inside a Suspense
        boundary
      </p>
      <p>
        With PPR this page should be partially static, showing the fallback of
        the Suspense boundary surrounding our simulated IO.
      </p>
      <p>Without PPR this page should be dynamic.</p>
      <Suspense fallback="loading...">
        <ComponentWithIO />
        <div id="inner">{getSentinelValue()}</div>
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentWithIO() {
  await new Promise<void>((r) => setTimeout(r, 1000))
  return <p>hello IO</p>
}
