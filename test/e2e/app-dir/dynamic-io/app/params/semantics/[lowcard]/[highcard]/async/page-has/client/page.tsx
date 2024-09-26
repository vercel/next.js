'use client'

import { use } from 'react'

import { getSentinelValue } from '../../../../../../../getSentinelValue'

export default function Page({
  params,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
}) {
  return (
    <section>
      <p>
        This Page does key checking of the params prop in a client component
      </p>
      <div>
        page lowcard:{' '}
        <span id="param-has-lowcard">
          {'' + Reflect.has(use(params), 'lowcard')}
        </span>
      </div>
      <div>
        page highcard:{' '}
        <span id="param-has-highcard">
          {'' + Reflect.has(use(params), 'highcard')}
        </span>
      </div>
      <div>
        page foo:{' '}
        <span id="param-has-foo">{'' + Reflect.has(use(params), 'foo')}</span>
      </div>
      <span id="page">{getSentinelValue()}</span>
    </section>
  )
}
