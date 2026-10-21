import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getRenderTraceInfo } from '../../trace-recorder'

async function RequestInfo() {
  const requestHeaders = Object.fromEntries((await headers()).entries())
  const { traceId, requestParentSpanId } = getRenderTraceInfo()
  return (
    <>
      <p id="trace-id">{traceId}</p>
      <p id="request-parent-span-id">{requestParentSpanId}</p>
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
