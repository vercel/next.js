import { getSentinelValue } from '../../../../../../../../../getSentinelValue'

export default async function Page({
  params,
  children,
}: {
  params: Promise<{ dyn: string; then: string; value: string; status: string }>
  children: React.ReactNode
}) {
  const copied = { ...(await params) }
  return (
    <section>
      <p>
        This Layout accesses params that have name collisions with Promise
        properties. When synchronous access is available we assert that you can
        access non colliding param names directly and all params if you await
      </p>
      <ul>
        <li>
          dyn:{' '}
          <span id="param-dyn">{getValueAsString((await params).dyn)}</span>
        </li>
        <li>
          then:{' '}
          <span id="param-then">{getValueAsString((await params).then)}</span>
        </li>
        <li>
          value:{' '}
          <span id="param-value">{getValueAsString((await params).value)}</span>
        </li>
        <li>
          status:{' '}
          <span id="param-status">
            {getValueAsString((await params).status)}
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
