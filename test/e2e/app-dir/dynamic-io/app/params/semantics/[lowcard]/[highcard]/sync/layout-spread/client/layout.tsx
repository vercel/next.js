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
  const copied = { ...syncParams }
  return (
    <section>
      <p>
        This Layout spreads params in a client component without awaiting or
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
      {children}
    </section>
  )
}
