import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getRenderTraceInfo } from '../../trace-recorder'

async function TraceInfo() {
  // Reading request headers also makes this run at request time, so the
  // reported trace belongs to the request.
  const traceparent = (await headers()).get('traceparent') ?? 'none'
  const { traceId, requestParentSpanId } = getRenderTraceInfo()
  return (
    <>
      <p id="trace-id">{traceId}</p>
      {/* The parent of the render's request span (`BaseServer.handleRequest`). */}
      <p id="request-parent-span-id">{requestParentSpanId}</p>
      {/* The trace context the render received. */}
      <p id="traceparent">{traceparent}</p>
    </>
  )
}

export default function Page() {
  return (
    <Suspense>
      <TraceInfo />
    </Suspense>
  )
}
