import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getRenderSpans } from '../../trace-recorder'

async function RequestInfo() {
  const requestHeaders = Object.fromEntries((await headers()).entries())
  return (
    <>
      <pre id="spans">{JSON.stringify(getRenderSpans())}</pre>
      <pre id="headers">{JSON.stringify(requestHeaders)}</pre>
    </>
  )
}

export default function Page() {
  return (
    <Suspense>
      <RequestInfo />
    </Suspense>
  )
}
