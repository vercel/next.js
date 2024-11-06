import type { UnsafeUnwrappedParams } from 'next/server'

import { getSentinelValue } from '../../../../../../../../../getSentinelValue'

export default async function Page({
  params,
  children,
}: {
  params: Promise<{ dyn: string; then: string; value: string; status: string }>
  children: React.ReactNode
}) {
  await new Promise((r) => process.nextTick(r))
  const syncParams = params as unknown as UnsafeUnwrappedParams<typeof params>
  const copied = { ...syncParams }
  return (
    <section>
      <p>
        This Layout accesses params that have name collisions with Promise
        properties. When synchronous access is available we assert that you can
        access non colliding param names directly and all params if you await
      </p>
      <ul>
        <li>
          dyn: <span id="param-dyn">{getValueAsString(syncParams.dyn)}</span>
        </li>
        <li>
          then:{' '}
          <span id="param-then">
            {getValueAsString(
              // @ts-expect-error we expect then to be unavailable on the syncParams type
              syncParams.then
            )}
          </span>
        </li>
        <li>
          value:{' '}
          <span id="param-value">
            {getValueAsString(
              // @ts-expect-error we expect value to be unavailable on the syncParams type
              syncParams.value
            )}
          </span>
        </li>
        <li>
          status:{' '}
          <span id="param-status">
            {getValueAsString(
              // @ts-expect-error we expect status to be unavailable on the syncParams type
              syncParams.status
            )}
          </span>
        </li>
      </ul>
      <div>
        copied: <pre>{JSON.stringify(copied)}</pre>
      </div>
      <span id="page">{getSentinelValue()}</span>
      {children}
    </section>
  )
}

function getValueAsString(value: any) {
  if (typeof value === 'string') {
    return value
  }

  return String(value)
}
