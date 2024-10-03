import { headers, type UnsafeUnwrappedHeaders } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <Component />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

function Component() {
  const _headers = headers() as unknown as UnsafeUnwrappedHeaders
  const hasHeader = _headers.has('x-sentinel')
  if (hasHeader) {
    return (
      <div>
        header <span id="x-sentinel">{_headers.get('x-sentinel')}</span>
      </div>
    )
  } else {
    return <div>no header found</div>
  }
}
