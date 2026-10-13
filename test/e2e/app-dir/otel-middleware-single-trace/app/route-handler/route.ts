import { trace } from '@opentelemetry/api'

export const dynamic = 'force-dynamic'

export function GET() {
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'none'
  return Response.json({ traceId })
}
