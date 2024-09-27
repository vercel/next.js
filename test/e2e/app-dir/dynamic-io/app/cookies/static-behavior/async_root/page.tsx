import { cookies } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <Component />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function Component() {
  const cookie = (await cookies()).get('x-sentinel')
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
