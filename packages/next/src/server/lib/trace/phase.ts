import type { SpanTypes } from './constants'
import { getTracer, SpanStatusCode } from './tracer'

export type TracePhaseCompletion = { error: unknown }
export type FinishTracePhase = (completion?: TracePhaseCompletion) => void

export function createOneShotTracePhase(
  type: SpanTypes,
  spanName: string
): FinishTracePhase {
  if (
    !process.env.__NEXT_REQUEST_INSIGHTS &&
    process.env.NEXT_OTEL_VERBOSE !== '1'
  ) {
    return () => {}
  }

  const tracer = getTracer()
  const startTime = performance.timeOrigin + performance.now()
  const parentSpan = tracer.getActiveScopeSpan()
  let isFinished = false

  return (completion) => {
    if (isFinished) {
      return
    }
    isFinished = true

    tracer.trace(
      type,
      {
        startTime,
        parentSpan,
        spanName,
      },
      (span) => {
        if (!completion) {
          return
        }

        const { error } = completion
        if (error instanceof Error) {
          span?.recordException(error)
          span?.setAttribute('error.type', error.name)
        }
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : undefined,
        })
      }
    )
  }
}
