import { headers, type UnsafeUnwrappedHeaders } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'
import { AllComponents } from '../components'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const xSentinelValues = new Set<string>()
  // We use the async form here to avoid triggering dev warnings. this is not direclty being
  // aserted, it just helps us do assertions in our AllComponents
  for (let [headerName, headerValue] of (await headers()).entries()) {
    if (headerName.startsWith('x-sentinel')) {
      xSentinelValues.add(headerValue)
    }
  }

  const allHeaders = headers() as unknown as UnsafeUnwrappedHeaders
  return (
    <>
      <p>
        This page will exercise a number of APIs on the headers() instance
        directly (without awaiting it as a promise). It should not produce
        runtime errors but it will warn in dev
      </p>
      <AllComponents
        headers={allHeaders}
        xSentinelValues={xSentinelValues}
        expression="headers()"
      />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
