import { trace } from '@opentelemetry/api'

// Reports what the current runtime can observe about the registered tracer
// provider.
export function probe() {
  const span = trace.getTracer('builtin-tracing').startSpan('probe')
  const recording = span.isRecording()
  span.end()
  return Response.json({
    recording,
    activeSpanRecording: trace.getActiveSpan()?.isRecording() ?? false,
    userRegisterCount:
      (globalThis as { __userRegisterCount?: number }).__userRegisterCount ?? 0,
  })
}
