import { UnsafeUnwrappedParams } from 'next/server'

import { getSentinelValue } from '../../../../../../../getSentinelValue'

export default async function Page({
  params,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
}) {
  await new Promise((r) => process.nextTick(r))
  const syncParams = params as unknown as UnsafeUnwrappedParams<typeof params>
  return (
    <section>
      <p>
        This Page accesses params directly in a server component inside a high
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
