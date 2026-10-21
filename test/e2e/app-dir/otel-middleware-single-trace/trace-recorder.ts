import { trace, type Context } from '@opentelemetry/api'
import type {
  ReadableSpan,
  Span as SdkSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base'

// Records every span started in this process with its parent, using only
// public OpenTelemetry APIs (`onStart`'s parent context), so the app can report
// the spans of a request itself. This works in the Node.js and Edge runtimes
// and when deployed, where no collector is reachable.

export interface RecordedSpan {
  id: string
  parentId: string | undefined
  traceId: string
  name: string
  /** The `next.span_type` attribute. */
  type: string | undefined
}

interface Entry {
  span: SdkSpan
  parentId: string | undefined
}

const MAX_RECORDED_SPANS = 10_000

function getRecordedSpans(): Map<string, Entry> {
  const store = globalThis as typeof globalThis & {
    __otelTestRecordedSpans?: Map<string, Entry>
  }
  store.__otelTestRecordedSpans ??= new Map()
  return store.__otelTestRecordedSpans
}

export const spanRecorder: SpanProcessor = {
  onStart(span: SdkSpan, parentContext: Context) {
    const spans = getRecordedSpans()
    if (spans.size >= MAX_RECORDED_SPANS) {
      // Drop the oldest entry (Map iterates in insertion order).
      spans.delete(spans.keys().next().value!)
    }
    spans.set(span.spanContext().spanId, {
      span,
      parentId: trace.getSpanContext(parentContext)?.spanId,
    })
  },
  onEnd(_span: ReadableSpan) {},
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
}

// Read when reported, so spans renamed after they started (e.g. a request
// span named after its route) show their current name.
function toRecordedSpan({ span, parentId }: Entry): RecordedSpan {
  const type = span.attributes['next.span_type']
  return {
    id: span.spanContext().spanId,
    parentId,
    traceId: span.spanContext().traceId,
    name: span.name,
    type: typeof type === 'string' ? type : undefined,
  }
}

/** The given span and its ancestors, as far as they were started here. */
function getChain(spanId: string | undefined) {
  const spans = getRecordedSpans()
  const chain: RecordedSpan[] = []
  let entry = spanId ? spans.get(spanId) : undefined
  while (entry) {
    chain.push(toRecordedSpan(entry))
    entry = entry.parentId ? spans.get(entry.parentId) : undefined
  }
  return chain
}

/** The middleware's span chain: its active span and that span's ancestors. */
export function getMiddlewareSpans() {
  return getChain(trace.getActiveSpan()?.spanContext().spanId)
}

/**
 * The render's spans: its request span (the nearest `BaseServer.handleRequest`
 * ancestor of the active span), that span's ancestors, and the request span's
 * descendants started so far.
 */
export function getRenderSpans() {
  const chain = getChain(trace.getActiveSpan()?.spanContext().spanId)
  const index = chain.findIndex(
    (span) => span.type === 'BaseServer.handleRequest'
  )
  if (index === -1) {
    return chain
  }
  const requestSpanId = chain[index].id
  const descendants = [...getRecordedSpans().values()]
    .filter(({ parentId }) =>
      getChain(parentId).some((span) => span.id === requestSpanId)
    )
    .map(toRecordedSpan)
  return [...chain.slice(index), ...descendants]
}
