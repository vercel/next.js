import { headers } from 'next/headers'

import { getSentinelValue } from '../../getSentinelValue'
import { AllComponents } from './components'

export default async function Page() {
  const allHeaders = await headers()

  const xSentinelValues = new Set<string>()
  for (let [headerName, headerValue] of allHeaders.entries()) {
    if (headerName.startsWith('x-sentinel')) {
      xSentinelValues.add(headerValue)
    }
  }

  return (
    <>
      <p>
        This page will exercise a number of APIs on the headers() instance by
        first awaiting it. This is the correct way to consume headers() and this
        test partially exists to ensure the behavior between sync and async
        access is consistent for the time where you are permitted to do either
      </p>
      <AllComponents
        headers={allHeaders}
        xSentinelValues={xSentinelValues}
        expression={'(await headers())'}
      />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
