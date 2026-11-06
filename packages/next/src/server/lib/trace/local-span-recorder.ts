import type {
  AttributeValue,
  Span,
  SpanContext,
  SpanOptions,
  SpanStatusCode,
} from '@opentelemetry/api'
import type {
  SpanStoreAttributes,
  SpanStoreEvent,
  SpanStoreLink,
  SpanStoreRecord,
  LocalSpanParent,
} from './span-store'
import type { ToolingSpanSource } from '../../../trace/trace'
import type { SpanId } from '../../../trace/types'
import { getOrCreateGlobalAsyncLocalStorage } from '../../app-render/async-local-storage'

export { isLocalSpanRecordingEnabled } from './span-store'

const TRACE_ID_HEX_LENGTH = 32
const SPAN_ID_HEX_LENGTH = 16
// The OTel status code is part of its public API. Keep recording independent of
// loading the runtime API.
const SPAN_STATUS_ERROR: SpanStatusCode = 2

type LocalSpanAttributes = Partial<Record<string, AttributeValue | undefined>>

export type LocalSpanOptions = {
  name: string
  attributes?: Record<string, unknown>
  parent?: Span | SpanId | null
  links?: SpanOptions['links']
  /** Public OTel timestamp (epoch/relative milliseconds, Date or HrTime). */
  startTime?: SpanOptions['startTime']
  /** Lossless process.hrtime.bigint() timestamp, independent of wall time. */
  monotonicStartTime?: bigint
  wallStartTimeMs?: number
  traceId?: string
  spanId?: string
  delegateSpan?: Span
  publicParentSpan?: Span
  isolateOpenTelemetry?: boolean
}

export type LocalSpanDelivery = (spans: readonly SpanStoreRecord[]) => void

type TraceExistingLocalSpanOptions = {
  span: LocalRecordingSpan
}

// This association contains clocks/identity only, never mutable attributes,
// events or another end guard. Request spans do not enter this map.
const toolingSources = new WeakMap<Span, ToolingSpanSource>()
// Keep request-only/Edge imports independent of the tooling module. Cache its
// lazy load: even a cached require otherwise repeats resolution on every span.
let toolingTracing: typeof import('../../../trace/trace') | undefined

/** Internal numeric identity/clock metadata, independent of public OTel IDs. */
export function getToolingSpanSource(
  span: Span
): ToolingSpanSource | undefined {
  return toolingSources.get(span)
}

let lastLocalTraceId = 0
let lastLocalSpanId = 0

function getLocalTraceId(): string {
  return (++lastLocalTraceId).toString(16).padStart(TRACE_ID_HEX_LENGTH, '0')
}

export function createLocalSpanId(excludedId?: string): string {
  let spanId: string
  do {
    spanId = (++lastLocalSpanId).toString(16).padStart(SPAN_ID_HEX_LENGTH, '0')
  } while (spanId === excludedId)
  return spanId
}

/**
 * Local creation never captures request state. A caller may supply completed
 * record delivery; otherwise the existing direct file reporter owns delivery.
 * Numeric parents carry correlation only, never a public SDK context.
 */
export function createLocalSpan(
  options: LocalSpanOptions,
  recordSpans?: LocalSpanDelivery
): LocalRecordingSpan {
  const parent = typeof options.parent === 'object' ? options.parent : undefined
  const parentContext = parent?.spanContext()
  let source: ToolingSpanSource | undefined
  let attributes = options.attributes as LocalSpanAttributes | undefined
  if (!recordSpans) {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { captureToolingSpanSource, normalizeToolingAttributes } =
        (toolingTracing ??=
          require('../../../trace/trace') as typeof import('../../../trace/trace'))
      source = captureToolingSpanSource(
        {
          parent:
            typeof options.parent === 'number' || options.parent === null
              ? options.parent
              : undefined,
          startTime: options.startTime,
          monotonicStartTime: options.monotonicStartTime,
          wallStartTimeMs: options.wallStartTimeMs,
        },
        parent ? toolingSources.get(parent) : undefined
      )
      attributes = normalizeToolingAttributes(options.attributes)
    } else {
      throw new Error(
        'Default local file delivery is not available in the Edge runtime'
      )
    }
  }
  const span = new LocalRecordingSpan({
    name: options.name,
    attributes,
    links: options.links,
    startTime: options.startTime,
    delegateSpan: options.delegateSpan,
    publicParentSpan: options.publicParentSpan,
    traceId: options.traceId ?? parentContext?.traceId ?? getLocalTraceId(),
    spanId: options.spanId ?? createLocalSpanId(),
    parentSpanId: parentContext?.spanId,
    recordSpans,
    isolateOpenTelemetry: options.isolateOpenTelemetry ?? true,
  })
  if (source) toolingSources.set(span, source)
  return span
}

export function getActiveLocalSpan(): Span | undefined {
  return getLocalSpanAsyncStorage().getStore()?.span
}

export function getLocalParentSpan(
  publicContext: SpanContext | undefined
): Span | undefined {
  const store = getLocalSpanAsyncStorage().getStore()
  // Tooling has its own explicit numeric hierarchy. A request started while a
  // coarse compiler scope is active must not adopt that tooling parent.
  if (!store || toolingSources.has(store.span)) return undefined
  if (isOpenTelemetryIsolatedSpan(store.span)) return store.span

  // An SDK span opened inside this local scope is the nearer parent.
  if (
    publicContext?.traceId === store.publicContext?.traceId &&
    publicContext?.spanId === store.publicContext?.spanId
  ) {
    return store.span
  }
  return undefined
}

export function getOpenTelemetrySpan(span: Span): Span | undefined {
  return span instanceof LocalRecordingSpan ? span.getOpenTelemetrySpan() : span
}

export function reparentLocalSpans(
  parent: LocalSpanParent,
  spans: readonly SpanStoreRecord[]
): SpanStoreRecord[] {
  const importedIds = new Map<string, string>()
  const key = (traceId: string, spanId: string) => `${traceId}:${spanId}`
  for (const span of spans) {
    if (span.traceId && span.spanId) {
      importedIds.set(
        key(span.traceId, span.spanId),
        createLocalSpanId(parent.spanId)
      )
    }
  }

  return spans.map((span) => ({
    ...span,
    traceId: parent.traceId,
    spanId:
      (span.traceId && span.spanId
        ? importedIds.get(key(span.traceId, span.spanId))
        : undefined) ?? createLocalSpanId(parent.spanId),
    parentSpanId:
      (span.traceId && span.parentSpanId
        ? importedIds.get(key(span.traceId, span.parentSpanId))
        : undefined) ?? parent.spanId,
    links: span.links?.map((link) => {
      const spanId = importedIds.get(key(link.traceId, link.spanId))
      return spanId ? { ...link, traceId: parent.traceId, spanId } : link
    }),
  }))
}

export function isLocalRecordingSpan(span: Span): boolean {
  return span instanceof LocalRecordingSpan
}

export function isOpenTelemetryIsolatedSpan(span: Span): boolean {
  return span instanceof LocalRecordingSpan && span.isOpenTelemetryIsolated()
}

export function withLocalSpan<T>(
  span: Span,
  fn: () => T,
  publicContext?: SpanContext
): T {
  return getLocalSpanAsyncStorage().run({ span, publicContext }, fn)
}

/**
 * Records an operation without changing local or public OpenTelemetry scope.
 * Parents are explicit; request integration owns inherited parent resolution
 * and establishes its own local scope around the callback.
 *
 * The default remains asynchronous, including setup errors. Explicit synchronous
 * mode ends on return/throw without awaiting a returned promise.
 */
export function traceLocalSpan<T>(
  options: (LocalSpanOptions | TraceExistingLocalSpanOptions) & {
    synchronous: true
  },
  fn: (span: LocalRecordingSpan) => T
): T
export function traceLocalSpan<T>(
  options: (LocalSpanOptions | TraceExistingLocalSpanOptions) & {
    synchronous?: false
  },
  fn: (span: LocalRecordingSpan) => T | Promise<T>
): Promise<T>
export function traceLocalSpan<T>(
  options: (LocalSpanOptions | TraceExistingLocalSpanOptions) & {
    synchronous?: boolean
  },
  fn: (span: LocalRecordingSpan) => T | Promise<T>
): T | Promise<T> {
  const synchronous = options.synchronous ?? false
  const run = () => {
    let span: LocalRecordingSpan
    if ('span' in options) {
      // Some hook-delimited operations start before their callback is available.
      // Reuse their recorder and the same callback lifecycle, not a second span.
      span = options.span
    } else {
      span = createLocalSpan(options)
    }
    const tooling = toolingSources.has(span)
    const fail = (err: unknown): never => {
      if (tooling) span.setAttribute('failed', true)
      span.recordException(err as Error)
      span.setStatus({ code: SPAN_STATUS_ERROR })
      throw err
    }

    const execute = () => {
      let pending: Promise<T> | undefined
      try {
        const result = fn(span)
        if (synchronous) return result
        pending = Promise.resolve(result)
          .catch(fail)
          .finally(() => span.end())
        return pending
      } catch (err) {
        return fail(err)
      } finally {
        if (!pending) span.end()
      }
    }
    return execute()
  }

  return synchronous ? run() : (async () => run())()
}

function getLocalSpanAsyncStorage() {
  return getOrCreateGlobalAsyncLocalStorage<{
    span: Span
    publicContext: SpanContext | undefined
  }>('local-span-storage')
}

export class LocalRecordingSpan implements Span {
  public name: string

  private attributes: SpanStoreAttributes
  private events: SpanStoreEvent[]
  private readonly spanContextValue: ReturnType<Span['spanContext']>
  private readonly openTelemetryIsolated: boolean
  private delegateSpan?: Span
  private openTelemetrySpan: Span | undefined
  private readonly openTelemetrySpanContext: SpanContext | undefined
  private links?: SpanStoreLink[]
  private readonly parentSpanId?: string
  private recordSpans: LocalSpanDelivery | undefined
  private readonly startTime: number
  private statusCode: number | undefined
  private statusMessage: string | undefined
  private exception:
    | {
        type?: string
        message?: string
      }
    | undefined
  private ended: boolean

  constructor({
    name,
    attributes,
    links,
    startTime,
    delegateSpan,
    publicParentSpan,
    traceId,
    spanId,
    parentSpanId,
    recordSpans,
    isolateOpenTelemetry,
  }: {
    name: string
    attributes?: LocalSpanAttributes
    links?: SpanOptions['links']
    startTime?: SpanOptions['startTime']
    delegateSpan?: Span
    publicParentSpan?: Span
    traceId: string
    spanId: string
    parentSpanId?: string
    recordSpans?: LocalSpanDelivery
    isolateOpenTelemetry: boolean
  }) {
    this.name = name
    this.attributes = cleanSpanStoreAttributes(attributes)
    this.events = []
    this.delegateSpan = delegateSpan
    this.openTelemetrySpan = delegateSpan ?? publicParentSpan
    this.openTelemetrySpanContext = this.openTelemetrySpan?.spanContext()
    this.openTelemetryIsolated = isolateOpenTelemetry
    this.spanContextValue = delegateSpan?.spanContext() ?? {
      traceId,
      spanId,
      traceFlags: 0,
    }
    this.links = getSpanStoreLinks(links)
    this.parentSpanId = parentSpanId
    // Delivery is bound by the caller before entering the recorder.
    this.recordSpans = recordSpans
    this.startTime = getTimestamp(startTime)
    this.statusCode = undefined
    this.statusMessage = undefined
    this.exception = undefined
    this.ended = false
  }

  spanContext(): ReturnType<Span['spanContext']> {
    return this.spanContextValue
  }

  isOpenTelemetryIsolated(): boolean {
    return this.openTelemetryIsolated
  }

  getOpenTelemetrySpan(): Span | undefined {
    return (
      this.openTelemetrySpan ??
      (this.openTelemetrySpanContext
        ? (
            require('next/dist/compiled/@opentelemetry/api') as typeof import('next/dist/compiled/@opentelemetry/api')
          ).trace.wrapSpanContext(this.openTelemetrySpanContext)
        : undefined)
    )
  }

  setAttribute(key: string, value: AttributeValue): this {
    if (this.ended && !toolingSources.has(this)) {
      return this
    }

    this.attributes[key] = value
    this.delegateSpan?.setAttribute(key, value)
    return this
  }

  setAttributes(attributes: Parameters<Span['setAttributes']>[0]): this {
    if (this.ended && !toolingSources.has(this)) {
      return this
    }

    // OpenTelemetry attributes may be undefined. Ignore them instead of
    // overwriting an existing value as Object.assign would.
    for (const key of Object.keys(attributes)) {
      const value = attributes[key]
      if (value !== undefined) {
        this.attributes[key] = value
      }
    }
    this.delegateSpan?.setAttributes(attributes)
    return this
  }

  addEvent(
    name: string,
    attributesOrStartTime?: Parameters<Span['addEvent']>[1],
    startTime?: Parameters<Span['addEvent']>[2]
  ): this {
    if (this.ended) {
      return this
    }

    const eventTime =
      startTime === undefined && isTimestampInput(attributesOrStartTime)
        ? attributesOrStartTime
        : startTime
    this.events.push({
      name,
      timestamp: getTimestamp(eventTime),
      attributes: isSpanStoreAttributes(attributesOrStartTime)
        ? cleanSpanStoreAttributes(attributesOrStartTime)
        : undefined,
    })
    this.delegateSpan?.addEvent(name, attributesOrStartTime, startTime)
    return this
  }

  setStatus(status: Parameters<Span['setStatus']>[0]): this {
    if (this.ended) {
      return this
    }

    this.statusCode = status.code
    this.statusMessage = status.message
    this.delegateSpan?.setStatus(status)
    return this
  }

  updateName(name: string): this {
    if (this.ended) {
      return this
    }

    this.name = name
    this.delegateSpan?.updateName(name)
    return this
  }

  end(endTime?: Parameters<Span['end']>[0]): void {
    if (this.ended) {
      return
    }

    this.ended = true
    try {
      this.delegateSpan?.end(endTime)
    } finally {
      try {
        this.record(endTime)
      } finally {
        this.releaseReferences()
      }
    }
  }

  isRecording(): boolean {
    return !this.ended
  }

  recordException(
    exception: Parameters<Span['recordException']>[0],
    time?: Parameters<Span['recordException']>[1]
  ): void {
    if (this.ended) {
      return
    }

    this.exception = getSpanStoreException(exception)
    this.events.push({
      name: 'exception',
      timestamp: getTimestamp(time),
      attributes: getSpanStoreExceptionAttributes(this.exception),
    })
    this.delegateSpan?.recordException(exception, time)
  }

  private record(endTime: Parameters<Span['end']>[0]): void {
    const source = toolingSources.get(this)
    if (source && process.env.NEXT_RUNTIME !== 'edge') {
      const { completeToolingSpan } = (toolingTracing ??=
        require('../../../trace/trace') as typeof import('../../../trace/trace'))
      completeToolingSpan(source, this.name, this.attributes, endTime)
      return
    }
    const recordAttributes =
      Object.keys(this.attributes).length > 0 ? this.attributes : undefined

    this.recordSpans?.([
      {
        timestamp: getTimestamp(),
        name: this.name,
        startTime: this.startTime,
        durationMs: Math.max(0, getTimestamp(endTime) - this.startTime),
        status: this.statusCode === SPAN_STATUS_ERROR ? 'error' : 'ok',
        traceId: this.spanContextValue.traceId,
        spanId: this.spanContextValue.spanId,
        parentSpanId: this.parentSpanId,
        route:
          getStringAttribute(recordAttributes, 'next.route') ??
          getStringAttribute(recordAttributes, 'http.route'),
        url: getStringAttribute(recordAttributes, 'http.url'),
        attributes: recordAttributes,
        links: this.links,
        events: this.events.length > 0 ? this.events : undefined,
        error: this.getRecordError(),
      },
    ])
  }

  private releaseReferences(): void {
    // AsyncLocalStorage can keep an ended span reachable when work spawned
    // inside the span outlives it. Keep only the immutable span context and
    // primitive timing/identity fields needed by the Span API after end.
    // Legacy saved tooling events retain the normalized tag object and permit
    // late attribute writes. Request spans release it and ignore later writes.
    if (!toolingSources.has(this)) {
      this.name = ''
      this.attributes = {}
    }
    this.events = []
    this.delegateSpan = undefined
    this.openTelemetrySpan = undefined
    this.links = undefined
    this.recordSpans = undefined
    this.statusMessage = undefined
    this.exception = undefined
  }

  private getRecordError():
    | {
        type?: string
        message?: string
      }
    | undefined {
    if (this.exception) {
      return this.exception
    }

    if (this.statusCode === SPAN_STATUS_ERROR && this.statusMessage) {
      return {
        message: this.statusMessage,
      }
    }

    return undefined
  }
}

function getSpanStoreLinks(
  links: SpanOptions['links'] | undefined
): SpanStoreLink[] | undefined {
  const spanStoreLinks = links?.map((link) => ({
    traceId: link.context.traceId,
    spanId: link.context.spanId,
    attributes: cleanSpanStoreAttributes(link.attributes),
  }))

  return spanStoreLinks?.length ? spanStoreLinks : undefined
}

function cleanSpanStoreAttributes(
  attributes:
    | Record<string, AttributeValue | undefined>
    | SpanStoreAttributes
    | undefined
): SpanStoreAttributes {
  const cleanedAttributes: SpanStoreAttributes = {}
  if (attributes) {
    for (const key of Object.keys(attributes)) {
      const value = attributes[key]
      if (value !== undefined) {
        cleanedAttributes[key] = value
      }
    }
  }
  return cleanedAttributes
}

function getTimestamp(time?: SpanOptions['startTime']): number {
  if (time instanceof Date) {
    return time.getTime()
  }

  if (Array.isArray(time)) {
    return time[0] * 1000 + time[1] / 1_000_000
  }

  if (typeof time === 'number') {
    return time < performance.timeOrigin / 2
      ? performance.timeOrigin + time
      : time
  }

  return performance.timeOrigin + performance.now()
}

function getStringAttribute(
  attributes: SpanStoreAttributes | undefined,
  key: string
): string | undefined {
  const value = attributes?.[key]
  return typeof value === 'string' ? value : undefined
}

function isSpanStoreAttributes(
  value: Parameters<Span['addEvent']>[1]
): value is SpanStoreAttributes {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  )
}

function isTimestampInput(
  value: Parameters<Span['addEvent']>[1]
): value is SpanOptions['startTime'] {
  return (
    typeof value === 'number' || Array.isArray(value) || value instanceof Date
  )
}

function getSpanStoreException(
  exception: Parameters<Span['recordException']>[0]
):
  | {
      type?: string
      message?: string
    }
  | undefined {
  if (exception instanceof Error) {
    return {
      type: exception.name,
      message: exception.message,
    }
  }

  if (typeof exception === 'string') {
    return {
      message: exception,
    }
  }

  if (exception && typeof exception === 'object') {
    return {
      type: exception.constructor?.name,
      message: 'message' in exception ? String(exception.message) : undefined,
    }
  }

  return undefined
}

function getSpanStoreExceptionAttributes(
  exception:
    | {
        type?: string
        message?: string
      }
    | undefined
): SpanStoreAttributes | undefined {
  if (!exception) {
    return undefined
  }

  const attributes: SpanStoreAttributes = {}
  if (exception.type !== undefined) {
    attributes['exception.type'] = exception.type
  }
  if (exception.message !== undefined) {
    attributes['exception.message'] = exception.message
  }
  return Object.keys(attributes).length > 0 ? attributes : undefined
}
