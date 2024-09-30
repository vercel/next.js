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
        This Layout does key checking of the params prop in a client component
        without `use`ing first
      </p>
      <div>
        page lowcard:{' '}
        <span id="param-has-lowcard">
          {'' + Reflect.has(syncParams, 'lowcard')}
        </span>
      </div>
      <div>
        page highcard:{' '}
        <span id="param-has-highcard">
          {'' + Reflect.has(syncParams, 'highcard')}
        </span>
      </div>
      <div>
        page foo:{' '}
        <span id="param-has-foo">{'' + Reflect.has(syncParams, 'foo')}</span>
      </div>
      <span id="page">{getSentinelValue()}</span>
      {children}
    </section>
  )
}
