import { trace } from '@opentelemetry/api'
import { headers } from 'next/headers'

export default async function Page() {
  const requestHeaders = Object.fromEntries((await headers()).entries())
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'none'
  return (
    <>
      <p id="trace-id">{traceId}</p>
      <pre id="headers">{JSON.stringify(requestHeaders)}</pre>
    </>
  )
}
