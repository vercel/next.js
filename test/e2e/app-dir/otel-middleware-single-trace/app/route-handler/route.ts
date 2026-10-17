import { connection } from 'next/server'
import { getRenderTraceInfo } from '../../trace-recorder'

export async function GET(request: Request) {
  // Run at request time so the reported trace belongs to the request.
  await connection()
  const { traceId, requestParentSpanId } = getRenderTraceInfo()
  // The trace context the route handler received.
  const traceparent = request.headers.get('traceparent') ?? 'none'
  return Response.json({ traceId, requestParentSpanId, traceparent })
}
