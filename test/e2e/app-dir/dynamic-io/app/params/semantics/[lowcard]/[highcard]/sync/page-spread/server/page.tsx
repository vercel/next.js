import { UnsafeUnwrappedParams } from 'next/server'

import { getSentinelValue } from '../../../../../../../getSentinelValue'

export default async function Page({
  params,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
}) {
  await new Promise((r) => process.nextTick(r))
  const syncParams = params as unknown as UnsafeUnwrappedParams<typeof params>
  const copied = { ...syncParams }
  return (
    <section>
      <p>
        This Page spreads params in a server component without awaiting or
        `use`ing it first
      </p>
      <div>
        page lowcard: <span id="param-copied-lowcard">{copied.lowcard}</span>
      </div>
      <div>
        page highcard: <span id="param-copied-highcard">{copied.highcard}</span>
      </div>
      <div>
        param key count:{' '}
        <span id="param-key-count">{Object.keys(copied).length}</span>
      </div>
      <span id="page">{getSentinelValue()}</span>
    </section>
  )
}
