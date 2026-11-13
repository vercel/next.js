import type {
  AttributeValue,
  Context,
  SpanStatus,
  Span,
  SpanContext,
  SpanOptions,
  SpanStatusCode,
} from '@opentelemetry/api'
import {
  isLocalSpanRecordingEnabled,
  isLocalSpanSinkActive,
  type SpanStoreAttributes,
  type SpanStoreEvent,
  type SpanStoreLink,
  type SpanStoreRecord,
  type LocalSpanParent,
} from './span-store'
import { captureRequestSpanRecorder } from './request-insights-span-recorder'
import { normalizeTraceAttributes } from './span-attributes'
import { getTimestamp, toHrTime } from './utils'
export { isLocalSpanRecordingEnabled } from './span-store'

function epochNanoseconds(time?: Parameters<Span['end']>[0]): bigint {
  if (Array.isArray(time))
    return BigInt(time[0]) * BigInt(1_000_000_000) + BigInt(time[1])
  const ms = getTimestamp(time)
  return (
    BigInt(Math.trunc(ms)) * BigInt(1_000_000) +
    BigInt(Math.trunc((ms - Math.trunc(ms)) * 1_000_000))
  )
}

const TRACE_ID_HEX_LENGTH = 32
const SPAN_ID_HEX_LENGTH = 16
// The OTel status code is part of its public API. Keep recording independent of
// loading the runtime API.
const SPAN_STATUS_ERROR: SpanStatusCode = 2

export type LocalSpanOptions = {
  name: string
  attributes?: Record<string, unknown>
  parent?: Span | null
  links?: SpanOptions['links']
  /** Public OTel timestamp (epoch/relative milliseconds, Date or HrTime). */
  startTime?: SpanOptions['startTime']
  traceId?: string
  spanId?: string
  parentSpanId?: string
  delegateSpan?: Span
  openTelemetry?: { options: SpanOptions; context: Context }
  publicParentSpan?: Span
  isolateOpenTelemetry?: boolean
  clock?: { start: bigint; end(time?: Parameters<Span['end']>[0]): bigint }
  onError?: (span: LocalRecordingSpan, error: unknown) => void
}

// Delivery consumes the capture synchronously, before payloads are released.
export type LocalSpanDelivery = (span: LocalRecordingSpan, end: bigint) => void

type TraceExistingLocalSpanOptions = {
  span: LocalRecordingSpan
}

let lastLocalTraceId = 0
let lastLocalSpanId = 0

export function createLocalSpanId(excludedId?: string): string {
  let spanId: string
  do {
    spanId = (++lastLocalSpanId).toString(16).padStart(SPAN_ID_HEX_LENGTH, '0')
  } while (spanId === excludedId)
  return spanId
}

/** Shared recording with delivery selected by the caller. */
export function createRecordingSpan(
  options: LocalSpanOptions,
  recordSpans: LocalSpanDelivery
): LocalRecordingSpan {
  let delegateSpan = options.delegateSpan
  if (!delegateSpan && options.openTelemetry) {
    const { getTracerInstance } =
      require('./otel-api') as typeof import('./otel-api')
    delegateSpan = getTracerInstance().startSpan(
      options.name,
      options.openTelemetry.options,
      options.openTelemetry.context
    )
  }
  const span = new LocalRecordingSpan({ ...options, delegateSpan }, recordSpans)
  return span
}

type RequestSpanOptions = Omit<
  LocalSpanOptions,
  'attributes' | 'clock' | 'onError'
> & {
  attributes?: Partial<Record<string, AttributeValue | undefined>>
}

export function createLocalSpan(
  options: RequestSpanOptions
): LocalRecordingSpan {
  return createRecordingSpan(
    { ...options, isolateOpenTelemetry: options.isolateOpenTelemetry ?? false },
    captureRequestSpanRecorder()
  )
}

export function getActiveLocalSpan(): Span | undefined {
  return getLocalSpanAsyncStorage().getStore()?.span
}

export function getLocalParentSpan(
  publicContext: SpanContext | undefined
): Span | undefined {
  const store = getLocalSpanAsyncStorage().getStore()
  if (!store) return undefined
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

type TraceLocalSpanOptions = Omit<RequestSpanOptions, 'parent'> & {
  parentSpan?: Span | null
}

// Validation operations deliberately isolate local context from the app SDK.
// Only request callbacks inherit an active request parent and establish scope.
export function traceLocalSpan<T>(
  options: TraceLocalSpanOptions & { synchronous: true },
  fn: (span: LocalRecordingSpan) => T
): T
export function traceLocalSpan<T>(
  options: TraceLocalSpanOptions & { synchronous?: false },
  fn: (span: LocalRecordingSpan) => T | Promise<T>
): Promise<T>
export function traceLocalSpan<T>(
  { parentSpan, ...options }: TraceLocalSpanOptions & { synchronous?: boolean },
  fn: (span: LocalRecordingSpan) => T | Promise<T>
): T | Promise<T> {
  const run = () => {
    const parent = parentSpan === undefined ? getActiveLocalSpan() : parentSpan
    const span = createLocalSpan({
      ...options,
      parent,
      isolateOpenTelemetry: true,
    })
    const execute = () => withLocalSpan(span, () => fn(span))
    return options.synchronous
      ? recordSpan({ span, synchronous: true }, execute)
      : recordSpan({ span }, execute)
  }
  // Preserve the asynchronous default, including errors during creation.
  return options.synchronous ? run() : (async () => run())()
}

export type LocalSpanRecorder = {
  createLocalSpan: typeof createLocalSpan
  getActiveLocalSpan: typeof getActiveLocalSpan
  getLocalParentSpan: typeof getLocalParentSpan
  getOpenTelemetrySpan: typeof getOpenTelemetrySpan
  isLocalRecordingSpan: typeof isLocalRecordingSpan
  isOpenTelemetryIsolatedSpan: typeof isOpenTelemetryIsolatedSpan
  isLocalSpanRecordingEnabled: typeof isLocalSpanRecordingEnabled
  isLocalSpanSinkActive: typeof isLocalSpanSinkActive
  traceLocalSpan: typeof traceLocalSpan
  withLocalSpan: typeof withLocalSpan
}

// Bundled tracer copies reach this externalized request integration without
// sharing request state globally. Only these functions are registered.
const LOCAL_SPAN_RECORDER_KEY = Symbol.for(
  `@next/local-span-recorder@${process.env.__NEXT_VERSION}`
)
type GlobalWithLocalSpanRecorder = typeof globalThis & {
  [LOCAL_SPAN_RECORDER_KEY]?: LocalSpanRecorder
}
export function registerLocalSpanRecorder({
  sinkOnly = false,
}: { sinkOnly?: boolean } = {}): void {
  ;(globalThis as GlobalWithLocalSpanRecorder)[LOCAL_SPAN_RECORDER_KEY] = {
    createLocalSpan,
    getActiveLocalSpan,
    getLocalParentSpan,
    getOpenTelemetrySpan,
    isLocalRecordingSpan,
    isOpenTelemetryIsolatedSpan,
    isLocalSpanRecordingEnabled: sinkOnly
      ? isLocalSpanSinkActive
      : isLocalSpanRecordingEnabled,
    isLocalSpanSinkActive,
    traceLocalSpan,
    withLocalSpan,
  }
}

export function recordSpan<T>(
  options: TraceExistingLocalSpanOptions & {
    synchronous: true
  },
  fn: (span: LocalRecordingSpan) => T
): T
export function recordSpan<T>(
  options: TraceExistingLocalSpanOptions & {
    synchronous?: false
  },
  fn: (span: LocalRecordingSpan) => T | Promise<T>
): Promise<T>
export function recordSpan<T>(
  options: TraceExistingLocalSpanOptions & {
    synchronous?: boolean
  },
  fn: (span: LocalRecordingSpan) => T | Promise<T>
): T | Promise<T> {
  const synchronous = options.synchronous ?? false
  const run = () => {
    const span = options.span
    const fail = (err: unknown): never => {
      span.recordError(err)
      throw err
    }

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

  return synchronous ? run() : (async () => run())()
}

function getLocalSpanAsyncStorage() {
  const { getOrCreateGlobalAsyncLocalStorage } =
    require('../../app-render/async-local-storage') as typeof import('../../app-render/async-local-storage')
  return getOrCreateGlobalAsyncLocalStorage<{
    span: Span
    publicContext: SpanContext | undefined
  }>('local-span-storage')
}

export class LocalRecordingSpan implements Span {
  public name: string

  public attributes: Record<string, unknown>
  private events: SpanStoreEvent[]
  private spanContextValue?: SpanContext
  private readonly identity: {
    traceId: string | number
    spanId: string | number
  }
  private readonly openTelemetryIsolated: boolean
  private delegateSpan?: Span
  private openTelemetrySpan: Span | undefined
  private readonly openTelemetrySpanContext: SpanContext | undefined
  private links?: SpanStoreLink[]
  private readonly parentSpanId?: string | number
  private recordSpans: LocalSpanDelivery | undefined
  private readonly startTime: number
  private clock?: LocalSpanOptions['clock']
  private onError?: LocalSpanOptions['onError']
  private status: SpanStatus | undefined
  private exception: SpanStoreRecord['error']
  private ended: boolean

  constructor(
    {
      name,
      attributes,
      parent,
      links,
      startTime,
      clock,
      onError,
      delegateSpan,
      publicParentSpan,
      traceId,
      spanId,
      parentSpanId,
      isolateOpenTelemetry = true,
    }: LocalSpanOptions,
    recordSpans: LocalSpanDelivery
  ) {
    const parentIdentity =
      parent instanceof LocalRecordingSpan
        ? parent.identity
        : parent?.spanContext()
    const delegateContext = delegateSpan?.spanContext()
    this.identity = {
      traceId:
        delegateContext?.traceId ??
        traceId ??
        parentIdentity?.traceId ??
        ++lastLocalTraceId,
      spanId: delegateContext?.spanId ?? spanId ?? ++lastLocalSpanId,
    }
    this.name = name
    this.clock = clock
    this.onError = onError
    this.attributes = { ...attributes }
    this.events = []
    this.delegateSpan = delegateSpan
    this.openTelemetrySpan = delegateSpan ?? publicParentSpan
    this.openTelemetrySpanContext = this.openTelemetrySpan?.spanContext()
    this.openTelemetryIsolated = isolateOpenTelemetry
    this.spanContextValue = delegateContext
    this.links = getSpanStoreLinks(links)
    this.parentSpanId = parentSpanId ?? parentIdentity?.spanId
    // Delivery is bound by the caller before entering the recorder.
    this.recordSpans = recordSpans
    this.startTime = getTimestamp(startTime)
    this.exception = undefined
    this.ended = false
  }

  spanContext(): ReturnType<Span['spanContext']> {
    return (this.spanContextValue ??= {
      traceId:
        typeof this.identity.traceId === 'number'
          ? this.identity.traceId
              .toString(16)
              .padStart(TRACE_ID_HEX_LENGTH, '0')
          : this.identity.traceId,
      spanId:
        typeof this.identity.spanId === 'number'
          ? this.identity.spanId.toString(16).padStart(SPAN_ID_HEX_LENGTH, '0')
          : this.identity.spanId,
      traceFlags: 0,
    })
  }

  isOpenTelemetryIsolated(): boolean {
    return this.openTelemetryIsolated
  }

  getOpenTelemetrySpan(): Span | undefined {
    return (
      this.openTelemetrySpan ??
      (this.openTelemetrySpanContext
        ? (
            require('./otel-api') as typeof import('./otel-api')
          ).api.trace.wrapSpanContext(this.openTelemetrySpanContext)
        : undefined)
    )
  }

  setAttribute(key: string, value: AttributeValue): this {
    if (this.ended) {
      return this
    }

    this.attributes[key] = value
    this.delegateSpan?.setAttribute(key, value)
    return this
  }

  setAttributes(attributes: Parameters<Span['setAttributes']>[0]): this {
    if (this.ended) {
      return this
    }

    for (const key of Object.keys(attributes)) {
      if (attributes[key] !== undefined) this.attributes[key] = attributes[key]
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

    this.status = { code: status.code, message: status.message }
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
    if (this.ended) return
    this.ended = true
    try {
      const end = this.clock?.end(endTime) ?? epochNanoseconds(endTime)
      try {
        this.delegateSpan?.end(this.clock ? toHrTime(end) : endTime)
      } finally {
        this.record(end)
      }
    } finally {
      this.releaseReferences()
    }
  }

  recordError(error: unknown): void {
    if (this.onError) this.onError(this, error)
    else {
      this.recordException(error as Error)
      this.setStatus({ code: SPAN_STATUS_ERROR })
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
    const attributes = cleanSpanStoreAttributes({
      'exception.type': this.exception?.type,
      'exception.message': this.exception?.message,
    })
    this.events.push({
      name: 'exception',
      timestamp: getTimestamp(time),
      attributes: Object.keys(attributes).length ? attributes : undefined,
    })
    this.delegateSpan?.recordException(exception, time)
  }

  toSpanStoreRecord(
    end: bigint,
    attributes: SpanStoreAttributes = normalizeTraceAttributes(
      this.attributes,
      true
    )
  ): SpanStoreRecord {
    const startTime = this.startTime
    const start = this.clock?.start ?? epochNanoseconds(startTime)
    const recordAttributes = Object.keys(attributes).length
      ? attributes
      : undefined
    const context = this.spanContext()
    return {
      timestamp: getTimestamp(),
      name: this.name,
      startTime,
      durationMs: Math.max(0, Number(end - start) / 1_000_000),
      status: this.status?.code === SPAN_STATUS_ERROR ? 'error' : 'ok',
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId:
        typeof this.parentSpanId === 'number'
          ? this.parentSpanId.toString(16).padStart(SPAN_ID_HEX_LENGTH, '0')
          : this.parentSpanId,
      route:
        getStringAttribute(recordAttributes, 'next.route') ??
        getStringAttribute(recordAttributes, 'http.route'),
      url: getStringAttribute(recordAttributes, 'http.url'),
      attributes: recordAttributes,
      links: this.links,
      events: this.events.length ? this.events : undefined,
      error: this.getRecordError(),
    }
  }

  private record(end: bigint): void {
    this.recordSpans?.(this, end)
  }

  private releaseReferences(): void {
    this.name = ''
    this.attributes = {}
    this.delegateSpan = undefined
    this.clock = undefined
    this.onError = undefined
    this.events = []
    this.openTelemetrySpan = undefined
    this.links = undefined
    this.recordSpans = undefined
    this.status = undefined
    this.exception = undefined
  }

  private getRecordError(): SpanStoreRecord['error'] {
    return (
      this.exception ??
      (this.status?.code === SPAN_STATUS_ERROR && this.status.message
        ? { message: this.status.message }
        : undefined)
    )
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
    | undefined,
  cleanedAttributes: SpanStoreAttributes = {}
): SpanStoreAttributes {
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
): SpanStoreRecord['error'] {
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
