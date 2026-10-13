import { trace } from '@opentelemetry/api'
import { headers } from 'next/headers'
import { Suspense } from 'react'

async function RequestInfo() {
  const requestHeaders = Object.fromEntries((await headers()).entries())
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'none'
  return (
    <>
      <p id="trace-id">{traceId}</p>
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
