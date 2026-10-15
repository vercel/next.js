import { trace } from '@opentelemetry/api'
import { headers } from 'next/headers'
import { Suspense } from 'react'

async function TraceInfo() {
  // Reading request headers also makes this run at request time, so the
  // reported trace belongs to the request.
  const traceparent = (await headers()).get('traceparent') ?? 'none'
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'none'
  return (
    <>
      <p id="trace-id">{traceId}</p>
      {/* The trace context the render was started from (its parent span). */}
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
