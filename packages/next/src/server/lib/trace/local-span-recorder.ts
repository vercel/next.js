import type {
  AttributeValue,
  Span,
  SpanOptions,
} from 'next/dist/compiled/@opentelemetry/api'
import type { AsyncLocalStorage } from 'async_hooks'
import { SpanStatusCode } from 'next/dist/compiled/@opentelemetry/api'
import {
  isLocalSpanRecordingEnabled,
  isRequestInsightsEnabled,
  recordSpan,
  type SpanStoreAttributes,
  type SpanStoreEvent,
  type SpanStoreLink,
} from './span-store'
import type { RequestInsightKind } from '../../../next-devtools/shared/request-insights'

export { isLocalSpanRecordingEnabled } from './span-store'

const TRACE_ID_HEX_LENGTH = 32
const SPAN_ID_HEX_LENGTH = 16

type LocalSpanAttributes = Partial<Record<string, AttributeValue | undefined>>

type LocalSpanOptions = {
  name: string
  attributes?: LocalSpanAttributes
  links?: SpanOptions['links']
  startTime?: SpanOptions['startTime']
  traceId?: string
  spanId?: string
  parentSpanId?: string
  delegateSpan?: Span
  isolateOpenTelemetry?: boolean
}

type TraceLocalSpanOptions = Omit<
  LocalSpanOptions,
  | 'traceId'
  | 'spanId'
  | 'parentSpanId'
  | 'delegateSpan'
  | 'isolateOpenTelemetry'
> & {
  parentSpan?: Span | null
}

let lastLocalTraceId = 0
let lastLocalSpanId = 0
let localSpanAsyncStorage: AsyncLocalStorage<Span> | undefined

const getLocalTraceId = () =>
  (++lastLocalTraceId).toString(16).padStart(TRACE_ID_HEX_LENGTH, '0')

const getLocalSpanId = () =>
  (++lastLocalSpanId).toString(16).padStart(SPAN_ID_HEX_LENGTH, '0')

export function createLocalSpan({
  name,
  attributes,
  links,
  startTime,
  traceId,
  spanId,
  parentSpanId,
  delegateSpan,
  isolateOpenTelemetry,
}: LocalSpanOptions): Span {
  return new LocalRecordingSpan({
    name,
    attributes,
    links,
    startTime,
    delegateSpan,
    traceId: traceId ?? getLocalTraceId(),
    spanId: spanId ?? getLocalSpanId(),
    parentSpanId,
    requestIdentity: getCurrentRequestIdentity(),
    isolateOpenTelemetry: isolateOpenTelemetry ?? false,
  })
}

export function getActiveLocalSpan(): Span | undefined {
  return localSpanAsyncStorage?.getStore()
}

export function isLocalRecordingSpan(span: Span): boolean {
  return span instanceof LocalRecordingSpan
}

export function isOpenTelemetryIsolatedSpan(span: Span): boolean {
  return span instanceof LocalRecordingSpan && span.isOpenTelemetryIsolated()
}

export function withLocalSpan<T>(span: Span, fn: () => T): T {
  return getLocalSpanAsyncStorage().run(span, fn)
}

/** Runs a callback without retaining the currently active local span. */
export function runWithoutLocalSpan<T>(fn: () => T): T {
  if (!localSpanAsyncStorage) {
    return fn()
  }
  return localSpanAsyncStorage.exit(fn)
}

/**
 * Records an async operation without replacing or exporting through the active
 * OpenTelemetry context. Nested Next.js spans remain in the local trace.
 */
export async function traceLocalSpan<T>(
  { parentSpan, ...options }: TraceLocalSpanOptions,
  fn: () => Promise<T>
): Promise<T> {
  const resolvedParentSpan =
    parentSpan === undefined ? getActiveLocalSpan() : parentSpan
  const parentSpanContext = resolvedParentSpan?.spanContext()
  const span = createLocalSpan({
    ...options,
    traceId: parentSpanContext?.traceId,
    parentSpanId: parentSpanContext?.spanId,
    isolateOpenTelemetry: true,
  })

  return withLocalSpan(span, async () => {
    try {
      return await fn()
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw err
    } finally {
      span.end()
    }
  })
}

export type LocalSpanRecorder = {
  createLocalSpan: typeof createLocalSpan
  getActiveLocalSpan: typeof getActiveLocalSpan
  isLocalRecordingSpan: typeof isLocalRecordingSpan
  isOpenTelemetryIsolatedSpan: typeof isOpenTelemetryIsolatedSpan
  isLocalSpanRecordingEnabled: typeof isLocalSpanRecordingEnabled
  isRequestInsightsEnabled: typeof isRequestInsightsEnabled
  runWithoutLocalSpan: typeof runWithoutLocalSpan
  traceLocalSpan: typeof traceLocalSpan
  withLocalSpan: typeof withLocalSpan
}

export function registerLocalSpanRecorder(): void {
  const key = Symbol.for('@next/local-span-recorder')
  ;(
    globalThis as typeof globalThis & {
      [key]?: LocalSpanRecorder
    }
  )[key] = {
    createLocalSpan,
    getActiveLocalSpan,
    isLocalRecordingSpan,
    isOpenTelemetryIsolatedSpan,
    isLocalSpanRecordingEnabled,
    isRequestInsightsEnabled,
    runWithoutLocalSpan,
    traceLocalSpan,
    withLocalSpan,
  }
}

function getLocalSpanAsyncStorage(): AsyncLocalStorage<Span> {
  if (!localSpanAsyncStorage) {
    const { createAsyncLocalStorage } =
      require('../../app-render/async-local-storage') as typeof import('../../app-render/async-local-storage')
    localSpanAsyncStorage = createAsyncLocalStorage()
  }

  return localSpanAsyncStorage
}

type RequestIdentity = {
  requestId?: string
  requestInsightKind?: RequestInsightKind
  htmlRequestId?: string
  route?: string
  url?: string
}

class LocalRecordingSpan implements Span {
  public name: string

  private attributes: SpanStoreAttributes
  private events: SpanStoreEvent[]
  private readonly spanContextValue: ReturnType<Span['spanContext']>
  private readonly openTelemetryIsolated: boolean
  private delegateSpan?: Span
  private links?: SpanStoreLink[]
  private readonly parentSpanId?: string
  private requestIdentity: RequestIdentity
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
    traceId,
    spanId,
    parentSpanId,
    requestIdentity,
    isolateOpenTelemetry,
  }: {
    name: string
    attributes?: LocalSpanAttributes
    links?: SpanOptions['links']
    startTime?: SpanOptions['startTime']
    delegateSpan?: Span
    traceId: string
    spanId: string
    parentSpanId?: string
    requestIdentity: RequestIdentity
    isolateOpenTelemetry: boolean
  }) {
    this.name = name
    this.attributes = cleanSpanStoreAttributes(attributes)
    this.events = []
    this.delegateSpan = delegateSpan
    this.openTelemetryIsolated = isolateOpenTelemetry
    this.spanContextValue = delegateSpan?.spanContext() ?? {
      traceId,
      spanId,
      traceFlags: 0,
    }
    this.links = getSpanStoreLinks(links)
    this.parentSpanId = parentSpanId
    this.requestIdentity = requestIdentity
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
    const recordAttributes =
      Object.keys(this.attributes).length > 0 ? this.attributes : undefined

    recordSpan({
      name: this.name,
      startTime: this.startTime,
      durationMs: Math.max(0, getTimestamp(endTime) - this.startTime),
      status: this.statusCode === SpanStatusCode.ERROR ? 'error' : 'ok',
      traceId: this.spanContextValue.traceId,
      spanId: this.spanContextValue.spanId,
      parentSpanId: this.parentSpanId,
      requestId: this.requestIdentity.requestId,
      requestInsightKind: this.requestIdentity.requestInsightKind,
      htmlRequestId: this.requestIdentity.htmlRequestId,
      route:
        getStringAttribute(recordAttributes, 'next.route') ??
        getStringAttribute(recordAttributes, 'http.route') ??
        this.requestIdentity.route,
      url:
        getStringAttribute(recordAttributes, 'http.url') ??
        this.requestIdentity.url,
      attributes: recordAttributes,
      links: this.links,
      events: this.events.length > 0 ? this.events : undefined,
      error: this.getRecordError(),
    })
  }

  private releaseReferences(): void {
    // AsyncLocalStorage can keep an ended span reachable when work spawned
    // inside the span outlives it. Keep only the immutable span context and
    // primitive timing/identity fields needed by the Span API after end.
    this.name = ''
    this.attributes = {}
    this.events = []
    this.delegateSpan = undefined
    this.links = undefined
    this.requestIdentity = {}
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

    if (this.statusCode === SpanStatusCode.ERROR && this.statusMessage) {
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

function getCurrentRequestIdentity(): RequestIdentity {
  try {
    const { getRequestInsightsIdentity } =
      require('./request-insights-identity') as typeof import('./request-insights-identity')
    const { workAsyncStorage } =
      require('../../app-render/work-async-storage.external') as typeof import('../../app-render/work-async-storage.external')
    const { workUnitAsyncStorage } =
      require('../../app-render/work-unit-async-storage.external') as typeof import('../../app-render/work-unit-async-storage.external')
    const workStore = workAsyncStorage.getStore()
    const workUnitStore = workUnitAsyncStorage.getStore()
    const requestInsightsIdentity = getRequestInsightsIdentity()
    const url =
      workUnitStore && 'url' in workUnitStore ? workUnitStore.url : undefined

    return {
      requestId: requestInsightsIdentity?.requestId ?? workStore?.requestId,
      requestInsightKind: requestInsightsIdentity?.kind,
      htmlRequestId:
        requestInsightsIdentity?.htmlRequestId ?? workStore?.htmlRequestId,
      route: workStore?.route,
      url: url ? `${url.pathname}${url.search}` : requestInsightsIdentity?.url,
    }
  } catch {
    return {}
  }
}
