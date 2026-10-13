import { trace } from '@opentelemetry/api'
import { connection } from 'next/server'

// Not matched by the middleware: a baseline for requests without middleware.
export default async function Page() {
  await connection()
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'none'
  return <p id="trace-id">{traceId}</p>
}
