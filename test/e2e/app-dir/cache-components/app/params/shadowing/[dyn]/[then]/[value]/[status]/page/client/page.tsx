'use client'

import { use } from 'react'

import { getSentinelValue } from '../../../../../../../../getSentinelValue'

export default function Page({
  params,
}: {
  params: Promise<{ dyn: string; then: string; value: string; status: string }>
}) {
  const copied = { ...use(params) }
  return (
    <section>
      <p>
        This Page accesses params that have name collisions with Promise
        properties. When synchronous access is available we assert that you can
        access non colliding param names directly and all params if you await
      </p>
      <ul>
        <li>
          dyn: <span id="param-dyn">{getValueAsString(use(params).dyn)}</span>
        </li>
        <li>
          then:{' '}
          <span id="param-then">{getValueAsString(use(params).then)}</span>
        </li>
        <li>
          value:{' '}
          <span id="param-value">{getValueAsString(use(params).value)}</span>
        </li>
        <li>
          status:{' '}
          <span id="param-status">{getValueAsString(use(params).status)}</span>
        </li>
      </ul>
      <div>
        copied: <pre>{JSON.stringify(copied)}</pre>
      </div>
      <span id="page">{getSentinelValue()}</span>
    </section>
  )
}

function getValueAsString(value: any) {
  if (typeof value === 'string') {
    return value
  }

  return String(value)
}
