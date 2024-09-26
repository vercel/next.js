import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

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
  const cookie = (cookies() as unknown as UnsafeUnwrappedCookies).get(
    'x-sentinel'
  )
  if (cookie && cookie.value) {
    return (
      <div>
        cookie <span id="x-sentinel">{cookie.value}</span>
      </div>
    )
  } else {
    return <div>no cookie found</div>
  }
}
