import { trace, type Context } from '@opentelemetry/api'
import type {
  ReadableSpan,
  Span as SdkSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base'

// Writes a lifecycle event for every span started and ended in this process to
// the console, using only public OpenTelemetry APIs, so the test can collect the
// finished spans of a request (with their times) after the response: from the
// server output when self-hosted, and from the runtime logs when deployed
// (where no collector is reachable). See `test/lib/otel-span-capture.ts` for
// the format (`SpanEvent`). This works in the Node.js and Edge runtimes.

const SPAN_EVENT_MARKER = '[otel-span]'

// Attributes shown in the span trees, as they are when the span ends.
const PRINTED_ATTRIBUTES = [
  'http.target',
  'http.route',
  'next.route',
  'http.status_code',
]

const MAX_REMEMBERED_SPANS = 10_000

interface Store {
  // The parent of each span started here, from `onStart`'s parent context.
  parents: Map<string, string | undefined>
  // The traces of the `instrumentation.ts` lifecycle spans ended here.
  lifecycleTraceIds: Set<string>
  // For unique event IDs.
  processId: string
  events: number
}

function getStore(): Store {
  const global = globalThis as typeof globalThis & {
    __otelTestSpanRecorder?: Store
  }
  global.__otelTestSpanRecorder ??= {
    parents: new Map(),
    lifecycleTraceIds: new Set(),
    processId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    events: 0,
  }
  return global.__otelTestSpanRecorder
}

// An `HrTime` (`[seconds, nanoseconds]`) in microseconds since the epoch.
function toMicroseconds([seconds, nanoseconds]: [number, number]) {
  return seconds * 1_000_000 + Math.floor(nanoseconds / 1_000)
}

function getType(span: { attributes: ReadableSpan['attributes'] }) {
  const type = span.attributes['next.span_type']
  return typeof type === 'string' ? type : undefined
}

function write(event: Record<string, unknown>) {
  const store = getStore()
  // Unique per event written, so the test can tell redeliveries of a log line
  // from distinct events (e.g. a span ended twice).
  const eventId = `${store.processId}-${store.events++}`
  console.log(`${SPAN_EVENT_MARKER} ${JSON.stringify({ eventId, ...event })}`)
}

export const spanRecorder: SpanProcessor = {
  onStart(span: SdkSpan, parentContext: Context) {
    const { traceId, spanId } = span.spanContext()
    const parentId = trace.getSpanContext(parentContext)?.spanId
    const { parents } = getStore()
    if (parents.size >= MAX_REMEMBERED_SPANS) {
      // Drop the oldest entry (Map iterates in insertion order).
      parents.delete(parents.keys().next().value!)
    }
    parents.set(spanId, parentId)
    write({
      event: 'start',
      traceId,
      id: spanId,
      parentId,
      name: span.name,
      type: getType(span),
      startTime: toMicroseconds(span.startTime),
    })
  },
  onEnd(span: ReadableSpan) {
    const { traceId, spanId } = span.spanContext()
    const store = getStore()
    const parentId = store.parents.has(spanId)
      ? store.parents.get(spanId)
      : span.parentSpanContext?.spanId
    store.parents.delete(spanId)
    const type = getType(span)
    if (type?.startsWith('Instrumentation.')) {
      store.lifecycleTraceIds.add(traceId)
    }
    const attributes: Record<string, string | number | boolean> = {}
    for (const key of PRINTED_ATTRIBUTES) {
      const value = span.attributes[key]
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        attributes[key] = value
      }
    }
    write({
      event: 'end',
      traceId,
      id: spanId,
      parentId,
      name: span.name,
      type,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      links:
        span.links.length > 0
          ? span.links.map(({ context }) => ({
              traceId: context.traceId,
              spanId: context.spanId,
            }))
          : undefined,
      startTime: toMicroseconds(span.startTime),
      endTime: toMicroseconds(span.endTime),
      status: span.status.code,
    })
  },
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
}

/**
 * The traces of the root spans the `@vercel/otel` span processor of this
 * process keeps as open (it keeps every root span until it ends), or
 * `undefined` if the processor isn't found. Relies on internals of
 * `@vercel/otel` and the OpenTelemetry SDK, for the test to check that the
 * middleware doesn't leave root spans open.
 */
export function getOpenRootSpanTraceIds(): string[] | undefined {
  const tracer = trace.getTracer('otel-test-root-state') as any
  const sdkTracer =
    typeof tracer._getTracer === 'function' ? tracer._getTracer() : tracer
  for (const processor of sdkTracer?._spanProcessor?._spanProcessors ?? []) {
    if (processor?.rootSpanIds instanceof Map) {
      return [...processor.rootSpanIds.keys()]
    }
  }
  return undefined
}

/** The trace of the active span, for the test to collect its spans. */
export function getActiveTraceId() {
  return trace.getActiveSpan()?.spanContext().traceId
}

/**
 * The traces of the `instrumentation.ts` lifecycle spans (`Instrumentation.*`)
 * that ended in this process.
 */
export function getInstrumentationTraceIds() {
  return [...getStore().lifecycleTraceIds]
}
