import { trace, type Context, type Span } from '@opentelemetry/api'
import type {
  ReadableSpan,
  Span as SdkSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base'

// Records the parent of every span started in this process, using only public
// OpenTelemetry APIs (`onStart`'s parent context), so the app can report which
// span its middleware / render spans are children of. This works in the
// Node.js and Edge runtimes and when deployed, where no collector is reachable.

interface RecordedSpan {
  traceId: string
  parentSpanId: string | undefined
  parentTraceId: string | undefined
  type: string | undefined
}

const MAX_RECORDED_SPANS = 10_000

function getRecordedSpans(): Map<string, RecordedSpan> {
  const store = globalThis as typeof globalThis & {
    __otelTestRecordedSpans?: Map<string, RecordedSpan>
  }
  store.__otelTestRecordedSpans ??= new Map()
  return store.__otelTestRecordedSpans
}

export const parentRecorder: SpanProcessor = {
  onStart(span: SdkSpan, parentContext: Context) {
    const spans = getRecordedSpans()
    if (spans.size >= MAX_RECORDED_SPANS) {
      // Drop the oldest entry (Map iterates in insertion order).
      spans.delete(spans.keys().next().value!)
    }
    const type = span.attributes['next.span_type']
    const parentSpanContext = trace.getSpanContext(parentContext)
    spans.set(span.spanContext().spanId, {
      traceId: span.spanContext().traceId,
      parentSpanId: parentSpanContext?.spanId,
      parentTraceId: parentSpanContext?.traceId,
      type: typeof type === 'string' ? type : undefined,
    })
  },
  onEnd(_span: ReadableSpan) {},
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
}

/** The recorded parent span ID of the given span, if it was started here. */
export function getParentSpanId(spanId: string | undefined) {
  return spanId ? getRecordedSpans().get(spanId)?.parentSpanId : undefined
}

/** The recorded `next.span_type` of the given span, if it was started here. */
export function getSpanType(spanId: string | undefined) {
  return spanId ? getRecordedSpans().get(spanId)?.type : undefined
}

/**
 * The span ID of the nearest `BaseServer.handleRequest` ancestor of `span`
 * (the render's request span), or `undefined` if none was started here.
 */
export function getRequestSpanId(span: Span | undefined) {
  let spanId = span?.spanContext().spanId
  while (spanId) {
    if (getSpanType(spanId) === 'BaseServer.handleRequest') {
      return spanId
    }
    spanId = getParentSpanId(spanId)
  }
  return undefined
}

/**
 * The `instrumentation.ts` lifecycle spans (`Instrumentation.*`) started in
 * this process, with their parent's span and trace ID, and its type when the
 * parent was started here too.
 */
export function getInstrumentationLifecycleSpans() {
  const spans = getRecordedSpans()
  return [...spans.values()]
    .filter((span) => span.type?.startsWith('Instrumentation.'))
    .map((span) => {
      const parent = span.parentSpanId
        ? spans.get(span.parentSpanId)
        : undefined
      return {
        type: span.type,
        traceId: span.traceId,
        parentSpanId: span.parentSpanId ?? null,
        parentTraceId: span.parentTraceId ?? null,
        parentType: parent?.type ?? null,
      }
    })
}

/**
 * Trace info of the render's request span: its trace ID and parent span ID.
 * Reported by the page / route handler that renders after the middleware.
 */
export function getRenderTraceInfo() {
  const span = trace.getActiveSpan()
  const requestSpanId = getRequestSpanId(span)
  return {
    traceId: span?.spanContext().traceId ?? 'none',
    requestParentSpanId: getParentSpanId(requestSpanId) ?? 'none',
  }
}
