import { trace } from '@opentelemetry/api'
import { connection } from 'next/server'

export async function GET(request: Request) {
  // Run at request time so the reported trace belongs to the request.
  await connection()
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'none'
  // The trace context the render was started from (its parent span).
  const traceparent = request.headers.get('traceparent') ?? 'none'
  return Response.json({ traceId, traceparent })
}
