'use client'

import { use } from 'react'

import { getSentinelValue } from '../../../../../../../getSentinelValue'

export default function Page({
  params,
  children,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
  children: React.ReactNode
}) {
  const copied = { ...use(params) }
  return (
    <section>
      <p>
        This Layout spreads params in a client component after `use`ing them
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
