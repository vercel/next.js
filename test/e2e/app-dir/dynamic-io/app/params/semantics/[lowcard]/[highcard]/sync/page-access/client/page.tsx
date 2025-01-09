'use client'

import { use } from 'react'

import { UnsafeUnwrappedParams } from 'next/server'

import { getSentinelValue } from '../../../../../../../getSentinelValue'

import { createWaiter } from '../../../../../../../client-utils'
const waiter = createWaiter()

export default function Page({
  params,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
}) {
  use(waiter.wait())
  waiter.cleanup()
  const syncParams = params as unknown as UnsafeUnwrappedParams<typeof params>
  return (
    <section>
      <p>
        This Page accesses params directly in a client component inside a high
        cardinality and low cardinality dynamic params
      </p>
      <div>
        page lowcard: <span id="param-lowcard">{syncParams.lowcard}</span>
      </div>
      <div>
        page highcard: <span id="param-highcard">{syncParams.highcard}</span>
      </div>
      <span id="page">{getSentinelValue()}</span>
    </section>
  )
}
