import { trace } from '@opentelemetry/api'
import { connection } from 'next/server'

export async function GET() {
  // Run at request time so the reported trace belongs to the request.
  await connection()
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'none'
  return Response.json({ traceId })
}
