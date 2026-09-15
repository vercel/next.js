import { getTracer } from './tracer'
import {
  captureLocalSpanContext,
  createLocalSpanId,
} from './local-span-recorder'
import {
  captureLocalSpanRecorder,
  isLocalSpanRecordingEnabled,
} from './span-store'
import { createReactTimingCollector } from './react-debug-timing'
import { warnOnce } from '../../../build/output/log'

export type LocalRenderTiming = NonNullable<
  ReturnType<typeof createLocalRenderTiming>
>

export function createLocalRenderTiming() {
  if (!isLocalSpanRecordingEnabled()) return undefined

  let collector: ReturnType<typeof createReactTimingCollector> | undefined
  let flightFinished = false
  let debugFinished = false
  let closed = false

  function finish() {
    if (flightFinished && debugFinished) {
      closed = true
      collector?.finish()
      collector = undefined
    }
  }

  return {
    start() {
      if (closed || collector) return
      try {
        const span = getTracer().getActiveScopeSpan()
        const parent = span?.spanContext()
        if (!parent) return
        const context = captureLocalSpanContext(parent)
        const record = captureLocalSpanRecorder()
        const renderId = createLocalSpanId(parent.spanId)
        const startTime = performance.timeOrigin + performance.now()

        collector = createReactTimingCollector(
          (timings) => {
            record(
              timings.map((timing) => ({
                ...context,
                name: `ReactServerComponents.${timing.kind}`,
                spanId: createLocalSpanId(parent.spanId),
                timestamp: timing.startTime + timing.durationMs,
                startTime: timing.startTime,
                durationMs: timing.durationMs,
                status: 'ok',
                attributes: {
                  'next.span_type': `ReactServerComponents.${timing.kind}`,
                  'next.span_name':
                    timing.kind === 'component'
                      ? `render ${timing.name}`
                      : `await ${timing.name}`,
                  'next.span_category': 'application',
                  'next.rsc.kind': timing.kind,
                  'next.rsc.render_id': renderId,
                  'next.rsc.environment': timing.environment,
                  ...(timing.source
                    ? {
                        'next.rsc.source.file': timing.source.file,
                        'next.rsc.source.line': timing.source.line,
                        'next.rsc.source.column': timing.source.column,
                        'next.rsc.source.name': timing.source.methodName,
                      }
                    : {}),
                  ...(timing.ownerName
                    ? { 'next.rsc.owner': timing.ownerName }
                    : {}),
                  ...(timing.componentPath
                    ? { 'next.rsc.component_path': timing.componentPath }
                    : {}),
                  'next.rsc.timing':
                    timing.kind === 'component' ? 'render-interval' : 'await',
                },
              }))
            )
          },
          (reason) => {
            record([
              {
                ...context,
                name: 'ReactServerComponents.incomplete',
                spanId: createLocalSpanId(parent.spanId),
                timestamp: startTime,
                startTime,
                durationMs: 0,
                status: 'ok',
                attributes: {
                  'next.span_type': 'ReactServerComponents.incomplete',
                  'next.rsc.render_id': renderId,
                  'next.rsc.incomplete_reason': reason,
                },
              },
            ])
            warnOnce(
              reason === 'budget'
                ? 'React render timing collection reached its diagnostic budget. Request Insights shows only the recorded intervals.'
                : 'Some React render timings could not be decoded. Request Insights shows only the recorded intervals.'
            )
          }
        )
      } catch {
        closed = true
      }
    },
    readFlightChunk(chunk: Uint8Array | string) {
      collector?.readFlightChunk(chunk)
    },
    readDebugChunk(chunk: Uint8Array | string) {
      collector?.readDebugChunk(chunk)
    },
    finishFlight() {
      flightFinished = true
      finish()
    },
    finishDebug() {
      debugFinished = true
      finish()
    },
    abort() {
      closed = true
      collector?.abort()
      collector = undefined
    },
  }
}
