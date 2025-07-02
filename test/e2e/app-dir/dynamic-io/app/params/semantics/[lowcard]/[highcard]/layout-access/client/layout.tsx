'use client'

import { use } from 'react'

import { getSentinelValue } from '../../../../../../getSentinelValue'

export default function Page({
  params,
  children,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
  children: React.ReactNode
}) {
  return (
    <section>
      <p>
        This Layout accesses params in a client component inside a high
        cardinality and low cardinality dynamic params
      </p>
      <div>
        page lowcard: <span id="param-lowcard">{use(params).lowcard}</span>
      </div>
      <div>
        page highcard: <span id="param-highcard">{use(params).highcard}</span>
      </div>
      <span id="page">{getSentinelValue()}</span>
      {children}
    </section>
  )
}
