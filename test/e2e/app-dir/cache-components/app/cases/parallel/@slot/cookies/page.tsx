import { cookies } from 'next/headers'

import { getSentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  const sentinel = (await cookies()).get('sentinel')
  return (
    <>
      <p>
        cookie slot (sentinel):{' '}
        <span id="value">{sentinel ? sentinel.value : 'no cookie'}</span>
      </p>
      <div id="page-slot">{getSentinelValue()}</div>
    </>
  )
}
