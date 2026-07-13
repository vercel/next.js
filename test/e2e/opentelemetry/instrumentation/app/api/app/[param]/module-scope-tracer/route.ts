import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('module-scope-tracer-route')

export async function GET() {
  const externalTraceApi = (
    globalThis as typeof globalThis & { __nextTestTraceApi?: typeof trace }
  ).__nextTestTraceApi
  if (externalTraceApi !== trace) {
    return new Response('route bundled a private OpenTelemetry API instance', {
      status: 500,
    })
  }

  return tracer.startActiveSpan('module-scope-tracer', (span) => {
    span.end()
    return new Response('ok')
  })
}

export const dynamic = 'force-dynamic'
