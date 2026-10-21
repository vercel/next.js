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
  /** The span's `PRINTED_ATTRIBUTES` that are set, when reported. */
  attributes?: Record<string, string | number | boolean>
}

// Attributes shown in the span trees, set by Next.js at different points of a
// request (some of them only once the request span ends, so they're only
// shown if they were set when the spans were reported).
const PRINTED_ATTRIBUTES = [
  'http.target',
  'http.route',
  'next.route',
  'http.status_code',
]

interface Entry {
  span: SdkSpan
  parentId: string | undefined
  parentTraceId: string | undefined
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
    const parentSpanContext = trace.getSpanContext(parentContext)
    spans.set(span.spanContext().spanId, {
      span,
      parentId: parentSpanContext?.spanId,
      parentTraceId: parentSpanContext?.traceId,
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
  return {
    id: span.spanContext().spanId,
    parentId,
    traceId: span.spanContext().traceId,
    name: span.name,
    type: typeof type === 'string' ? type : undefined,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
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

/** The spans started here so far below the given span (not the span itself). */
function getDescendants(spanId: string) {
  return [...getRecordedSpans().values()]
    .filter(({ parentId }) =>
      getChain(parentId).some((span) => span.id === spanId)
    )
    .map(toRecordedSpan)
}

/**
 * The middleware's spans: its active span, that span's ancestors, and the
 * descendants started so far of the topmost of them (e.g. spans started next
 * to the middleware span in the root inserted by the middleware adapter).
 */
export function getMiddlewareSpans() {
  const chain = getChain(trace.getActiveSpan()?.spanContext().spanId)
  if (chain.length === 0) {
    return chain
  }
  const ids = new Set(chain.map((span) => span.id))
  return [
    ...chain,
    ...getDescendants(chain[chain.length - 1].id).filter(
      (span) => !ids.has(span.id)
    ),
  ]
}

/**
 * The `instrumentation.ts` lifecycle spans (`Instrumentation.*`) started in
 * this process, with their parent's span and trace ID, and its type when the
 * parent was started here too.
 */
export function getInstrumentationLifecycleSpans() {
  const spans = getRecordedSpans()
  return [...spans.values()]
    .filter(({ span }) =>
      String(span.attributes['next.span_type']).startsWith('Instrumentation.')
    )
    .map((entry) => {
      const span = toRecordedSpan(entry)
      const parent = span.parentId ? spans.get(span.parentId) : undefined
      return {
        type: span.type,
        traceId: span.traceId,
        parentSpanId: entry.parentId ?? null,
        parentTraceId: entry.parentTraceId ?? null,
        parentType: parent ? (toRecordedSpan(parent).type ?? null) : null,
      }
    })
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
  return [...chain.slice(index), ...getDescendants(requestSpanId)]
}
