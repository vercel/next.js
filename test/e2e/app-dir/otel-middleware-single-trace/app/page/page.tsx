import { trace } from '@opentelemetry/api'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function TraceId() {
  // Run at request time so the reported trace belongs to the request.
  await connection()
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'none'
  return <p id="trace-id">{traceId}</p>
}

export default function Page() {
  return (
    <Suspense>
      <TraceId />
    </Suspense>
  )
}
