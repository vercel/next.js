import { cookies } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'
import { AllComponents } from '../components'

export default async function Page() {
  const allCookies = await cookies()
  return (
    <>
      <p>
        This page will exercise a number of APIs on the cookies() instance by
        first awaiting it. This is the correct way to consume cookies() and this
        test partially exists to ensure the behavior between sync and async
        access is consistent for the time where you are permitted to do either
      </p>
      <AllComponents cookies={allCookies} expression="(await cookies())" />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
