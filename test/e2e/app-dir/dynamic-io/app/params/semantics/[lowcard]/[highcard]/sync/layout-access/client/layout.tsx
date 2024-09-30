'use client'

import { UnsafeUnwrappedParams } from 'next/server'

import { getSentinelValue } from '../../../../../../../getSentinelValue'

export default async function Page({
  params,
  children,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
  children: React.ReactNode
}) {
  // We wait an extra microtask to avoid erroring before some sibling branches have completed.
  // In a future update we will make this a build error and explicitly test it but to keep the spirit of
  // this test in tact we contrive a slightly delayed sync access
  await 1
  const syncParams = params as unknown as UnsafeUnwrappedParams<typeof params>
  return (
    <section>
      <p>
        This Layout accesses params directly in a client component inside a high
        cardinality and low cardinality dynamic params
      </p>
      <div>
        page lowcard: <span id="param-lowcard">{syncParams.lowcard}</span>
      </div>
      <div>
        page highcard: <span id="param-highcard">{syncParams.highcard}</span>
      </div>
      <span id="page">{getSentinelValue()}</span>
      {children}
    </section>
  )
}
