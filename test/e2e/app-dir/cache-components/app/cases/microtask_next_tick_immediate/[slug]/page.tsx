import { Suspense } from 'react'

import { getSentinelValue } from '../../../getSentinelValue'

export function generateStaticParams() {
  return [{ slug: 'example' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await params
  return (
    <>
      <p>
        This page renders a component that awaits a microtask, a
        process.nextTick and a setImmediate. None of them is IO.
      </p>
      <p>With PPR this page should be entirely static.</p>
      <Suspense fallback="loading...">
        <ComponentWithImmediateAfterNextTick />
      </Suspense>
    </>
  )
}

async function ComponentWithImmediateAfterNextTick() {
  // The immediate is scheduled in a microtask that a nextTick callback queued.
  await 1
  await new Promise<void>((resolve) => process.nextTick(resolve))
  await new Promise<void>((resolve) => setImmediate(resolve))
  return <div id="inner">{getSentinelValue()}</div>
}
