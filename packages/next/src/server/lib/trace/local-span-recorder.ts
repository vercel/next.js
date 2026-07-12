import type {
  AttributeValue,
  Span,
  SpanOptions,
} from 'next/dist/compiled/@opentelemetry/api'
import type { AsyncLocalStorage } from 'async_hooks'
import { SpanStatusCode } from 'next/dist/compiled/@opentelemetry/api'
import {
  isLocalSpanStoreEnabled,
  recordSpan,
  type SpanStoreAttributes,
  type SpanStoreEvent,
  type SpanStoreLink,
} from './span-store'

export { isLocalSpanStoreEnabled } from './span-store'

const TRACE_ID_HEX_LENGTH = 32
const SPAN_ID_HEX_LENGTH = 16

type LocalSpanAttributes = Partial<Record<string, AttributeValue | undefined>>

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
  traceId,
  spanId,
  parentSpanId,
  delegateSpan,
}: {
  name: string
  attributes?: LocalSpanAttributes
  links?: SpanOptions['links']
  traceId?: string
  spanId?: string
  parentSpanId?: string
  delegateSpan?: Span
}): Span {
  return new LocalRecordingSpan({
    name,
    attributes,
    links,
    delegateSpan,
    traceId: traceId ?? getLocalTraceId(),
    spanId: spanId ?? getLocalSpanId(),
    parentSpanId,
    requestIdentity: getCurrentRequestIdentity(),
  })
}

export function getActiveLocalSpan(): Span | undefined {
  return localSpanAsyncStorage?.getStore()
}

export function isLocalRecordingSpan(span: Span): boolean {
  return span instanceof LocalRecordingSpan
}

export function withLocalSpan<T>(span: Span, fn: () => T): T {
  return getLocalSpanAsyncStorage().run(span, fn)
}

export type LocalSpanRecorder = {
  createLocalSpan: typeof createLocalSpan
  getActiveLocalSpan: typeof getActiveLocalSpan
  isLocalRecordingSpan: typeof isLocalRecordingSpan
  isLocalSpanStoreEnabled: typeof isLocalSpanStoreEnabled
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
    isLocalSpanStoreEnabled,
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
  htmlRequestId?: string
  route?: string
  url?: string
}

class LocalRecordingSpan implements Span {
  public name: string

  private attributes: SpanStoreAttributes
  private events: SpanStoreEvent[]
  private readonly spanContextValue: ReturnType<Span['spanContext']>
  private delegateSpan?: Span
  private links?: SpanStoreLink[]
  private readonly parentSpanId?: string
  private requestIdentity: RequestIdentity
  private readonly startTime: number
  private readonly startTimeMs: number
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
    delegateSpan,
    traceId,
    spanId,
    parentSpanId,
    requestIdentity,
  }: {
    name: string
    attributes?: LocalSpanAttributes
    links?: SpanOptions['links']
    delegateSpan?: Span
    traceId: string
    spanId: string
    parentSpanId?: string
    requestIdentity: RequestIdentity
  }) {
    this.name = name
    this.attributes = cleanSpanStoreAttributes(attributes)
    this.events = []
    this.delegateSpan = delegateSpan
    this.spanContextValue = delegateSpan?.spanContext() ?? {
      traceId,
      spanId,
      traceFlags: 0,
    }
    this.links = getSpanStoreLinks(links)
    this.parentSpanId = parentSpanId
    this.requestIdentity = requestIdentity
    this.startTime = Date.now()
    this.startTimeMs = getCurrentTimeMs()
    this.statusCode = undefined
    this.statusMessage = undefined
    this.exception = undefined
    this.ended = false
  }

  spanContext(): ReturnType<Span['spanContext']> {
    return this.spanContextValue
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

    this.events.push({
      name,
      timestamp: Date.now(),
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
        this.record()
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
      timestamp: Date.now(),
      attributes: getSpanStoreExceptionAttributes(this.exception),
    })
    this.delegateSpan?.recordException(exception, time)
  }

  private record(): void {
    const recordAttributes =
      Object.keys(this.attributes).length > 0 ? this.attributes : undefined

    recordSpan({
      name: this.name,
      startTime: this.startTime,
      durationMs: getCurrentTimeMs() - this.startTimeMs,
      status: this.statusCode === SpanStatusCode.ERROR ? 'error' : 'ok',
      traceId: this.spanContextValue.traceId,
      spanId: this.spanContextValue.spanId,
      parentSpanId: this.parentSpanId,
      requestId: this.requestIdentity.requestId,
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

function getCurrentTimeMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
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
    const { workAsyncStorage } =
      require('../../app-render/work-async-storage.external') as typeof import('../../app-render/work-async-storage.external')
    const { workUnitAsyncStorage } =
      require('../../app-render/work-unit-async-storage.external') as typeof import('../../app-render/work-unit-async-storage.external')
    const workStore = workAsyncStorage.getStore()
    const workUnitStore = workUnitAsyncStorage.getStore()
    const url =
      workUnitStore && 'url' in workUnitStore ? workUnitStore.url : undefined

    return {
      requestId: workStore?.requestId,
      htmlRequestId: workStore?.htmlRequestId,
      route: workStore?.route,
      url: url ? `${url.pathname}${url.search}` : undefined,
    }
  } catch {
    return {}
  }
}
