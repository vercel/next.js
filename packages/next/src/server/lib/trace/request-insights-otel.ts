import type { LocalSpanRecorder } from './local-span-recorder'
import type { RequestIdentity } from './request-insights-span-recorder'
import type {
  SpanStoreAttributeValue,
  SpanStoreAttributes,
  SpanStoreEvent,
  SpanStoreLink,
  SpanStoreRecord,
} from './span-store'

const REQUEST_INSIGHTS_SPAN_PROCESSOR_FACTORY = Symbol.for(
  '@next/request-insights-span-processor-factory'
)
const LOCAL_SPAN_RECORDER_KEY = Symbol.for(
  `@next/local-span-recorder@${process.env.__NEXT_VERSION}`
)
const OTEL_ERROR_STATUS_CODE = 2

export interface RequestInsightsSpanProcessor {
  forceFlush(): Promise<void>
  onEnd(span: unknown): void
  onStart(span: object, parentContext: unknown): void
  shutdown(): Promise<void>
}

type ActiveSpan = {
  identity: RequestIdentity
  recordSpans: (spans: readonly SpanStoreRecord[]) => void
}

class RequestInsightsSpanProcessorImpl implements RequestInsightsSpanProcessor {
  private readonly activeSpans = new WeakMap<object, ActiveSpan>()

  onStart(span: object): void {
    if (!process.env.__NEXT_DEV_SERVER) {
      return
    }

    const recorder = getLocalSpanRecorder()
    if (!recorder) {
      return
    }
    const identity = recorder.getCurrentRequestIdentity()
    if (identity.requestId) {
      this.activeSpans.set(span, {
        identity,
        recordSpans: recorder.captureLocalSpanRecorder(),
      })
    }
  }

  onEnd(span: unknown): void {
    if (!isObject(span)) {
      return
    }

    const activeSpan = this.activeSpans.get(span)
    this.activeSpans.delete(span)
    if (!activeSpan || isNextSpan(span)) {
      return
    }

    try {
      const record = getSpanRecord(span, activeSpan.identity)
      if (record) {
        activeSpan.recordSpans([record])
      }
    } catch {
      // Diagnostics must not affect application spans.
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

export function createRequestInsightsSpanProcessor(): RequestInsightsSpanProcessor {
  return new RequestInsightsSpanProcessorImpl()
}

/** @internal */
export function registerRequestInsightsSpanProcessorFactory(): void {
  if (!process.env.__NEXT_DEV_SERVER) {
    return
  }

  const globalStore = globalThis as typeof globalThis & {
    [REQUEST_INSIGHTS_SPAN_PROCESSOR_FACTORY]?: typeof createRequestInsightsSpanProcessor
  }
  globalStore[REQUEST_INSIGHTS_SPAN_PROCESSOR_FACTORY] ??=
    createRequestInsightsSpanProcessor
}

function getSpanRecord(
  span: Record<string, unknown>,
  identity: RequestIdentity
): SpanStoreRecord | undefined {
  const spanContext = readSpanContext(span)
  const name = span.name
  const startTime = readHrTime(span.startTime)
  const durationMs = readHrTime(span.duration)
  if (!spanContext || typeof name !== 'string' || startTime === undefined) {
    return undefined
  }

  const attributes: SpanStoreAttributes = {
    ...readAttributes(span.attributes),
    'next.span_category': 'opentelemetry',
  }
  const status = isObject(span.status) ? span.status : undefined
  const parentSpanContext = readSpanContext(span.parentSpanContext)
  const legacyParentSpanId = span.parentSpanId

  return {
    timestamp: performance.timeOrigin + performance.now(),
    name,
    startTime,
    durationMs,
    status: status?.code === OTEL_ERROR_STATUS_CODE ? 'error' : 'ok',
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    parentSpanId:
      parentSpanContext?.spanId ??
      (typeof legacyParentSpanId === 'string' ? legacyParentSpanId : undefined),
    requestId: identity.requestId,
    parentRequestId: identity.parentRequestId,
    requestInsightKind: identity.requestInsightKind,
    requestInsightSource: identity.requestInsightSource,
    requestInsightProxyStatus: identity.requestInsightProxyStatus,
    htmlRequestId: identity.htmlRequestId,
    url: identity.url,
    attributes,
    events: readEvents(span.events),
    links: readLinks(span.links),
    error:
      status?.code === OTEL_ERROR_STATUS_CODE &&
      typeof status.message === 'string'
        ? { message: status.message }
        : undefined,
  }
}

function isNextSpan(span: Record<string, unknown>): boolean {
  return (
    isObject(span.attributes) &&
    typeof span.attributes['next.span_type'] === 'string'
  )
}

function readSpanContext(
  value: unknown
): { traceId: string; spanId: string } | undefined {
  const context =
    isObject(value) && typeof value.spanContext === 'function'
      ? value.spanContext.call(value)
      : value
  if (
    !isObject(context) ||
    typeof context.traceId !== 'string' ||
    typeof context.spanId !== 'string'
  ) {
    return undefined
  }
  return { traceId: context.traceId, spanId: context.spanId }
}

function readHrTime(value: unknown): number | undefined {
  if (
    !Array.isArray(value) ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number'
  ) {
    return undefined
  }
  return value[0] * 1000 + value[1] / 1_000_000
}

function readAttributes(value: unknown): SpanStoreAttributes | undefined {
  if (!isObject(value)) {
    return undefined
  }

  const attributes: SpanStoreAttributes = {}
  for (const [key, attribute] of Object.entries(value)) {
    const sanitized = readAttributeValue(attribute)
    if (sanitized !== undefined) {
      attributes[key] = sanitized
    }
  }
  return Object.keys(attributes).length > 0 ? attributes : undefined
}

function readAttributeValue(
  value: unknown
): SpanStoreAttributeValue | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (!Array.isArray(value)) {
    return undefined
  }

  const definedValue = value.find((item) => item !== null && item !== undefined)
  if (definedValue === undefined) {
    return undefined
  }
  if (typeof definedValue === 'string') {
    return value.every((item) => item == null || typeof item === 'string')
      ? value
      : undefined
  }
  if (typeof definedValue === 'number') {
    return value.every((item) => item == null || typeof item === 'number')
      ? value
      : undefined
  }
  if (typeof definedValue === 'boolean') {
    return value.every((item) => item == null || typeof item === 'boolean')
      ? value
      : undefined
  }
  return undefined
}

function readEvents(value: unknown): SpanStoreEvent[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const events: SpanStoreEvent[] = []
  for (const event of value) {
    if (!isObject(event) || typeof event.name !== 'string') {
      continue
    }
    const timestamp = readHrTime(event.time)
    if (timestamp !== undefined) {
      events.push({
        name: event.name,
        timestamp,
        attributes: readAttributes(event.attributes),
      })
    }
  }
  return events.length > 0 ? events : undefined
}

function readLinks(value: unknown): SpanStoreLink[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const links: SpanStoreLink[] = []
  for (const link of value) {
    if (!isObject(link)) {
      continue
    }
    const context = readSpanContext(link.context)
    if (context) {
      links.push({
        ...context,
        attributes: readAttributes(link.attributes),
      })
    }
  }
  return links.length > 0 ? links : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getLocalSpanRecorder(): LocalSpanRecorder | undefined {
  const globalStore = globalThis as typeof globalThis & {
    [LOCAL_SPAN_RECORDER_KEY]?: LocalSpanRecorder
  }
  return globalStore[LOCAL_SPAN_RECORDER_KEY]
}
