'use client'

import { use } from 'react'

import { UnsafeUnwrappedParams } from 'next/server'

import { getSentinelValue } from '../../../../../../../getSentinelValue'

import { createWaiter } from '../../../../../../../client-utils'
const waiter = createWaiter()

export default function Page({
  params,
  children,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
  children: React.ReactNode
}) {
  use(waiter.wait())
  waiter.cleanup()
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
