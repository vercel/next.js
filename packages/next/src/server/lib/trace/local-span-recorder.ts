import type {
  AttributeValue,
  Span,
  SpanOptions,
} from 'next/dist/compiled/@opentelemetry/api'
import { SpanStatusCode } from 'next/dist/compiled/@opentelemetry/api'
import {
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
const localTraceIdByStore = new WeakMap<object, string>()

const getLocalTraceId = () =>
  (++lastLocalTraceId).toString(16).padStart(TRACE_ID_HEX_LENGTH, '0')

const getLocalSpanId = () =>
  (++lastLocalSpanId).toString(16).padStart(SPAN_ID_HEX_LENGTH, '0')

export function createLocalSpanRecorder({
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
}): {
  span: Span
  complete: (error?: Error) => void
} {
  const startTime = Date.now()
  const startTimeMs = getCurrentTimeMs()
  const requestIdentity = getCurrentRequestIdentity()
  const span = new LocalRecordingSpan({
    name,
    attributes,
    delegateSpan,
    traceId: traceId ?? getLocalTraceIdForCurrentStore(),
    spanId: spanId ?? getLocalSpanId(),
  })
  let recorded = false

  return {
    span,
    complete(error?: Error) {
      if (recorded) {
        return
      }
      recorded = true
      const recordAttributes = span.getAttributes()

      recordSpan({
        name: span.name,
        startTime,
        durationMs: getCurrentTimeMs() - startTimeMs,
        status: span.getRecordStatus(error),
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        parentSpanId,
        requestId: requestIdentity.requestId,
        htmlRequestId: requestIdentity.htmlRequestId,
        route:
          getStringAttribute(recordAttributes, 'next.route') ??
          getStringAttribute(recordAttributes, 'http.route') ??
          requestIdentity.route,
        url:
          getStringAttribute(recordAttributes, 'http.url') ??
          requestIdentity.url,
        attributes: recordAttributes,
        links: getSpanStoreLinks(links),
        events: span.getEvents(),
        error: span.getRecordError(error),
      })
    },
  }
}

class LocalRecordingSpan implements Span {
  public name: string

  private readonly attributes: SpanStoreAttributes
  private readonly events: SpanStoreEvent[] = []
  private readonly spanContextValue: ReturnType<Span['spanContext']>
  private readonly delegateSpan?: Span
  private statusCode: number | undefined
  private statusMessage: string | undefined
  private exception:
    | {
        type?: string
        message?: string
      }
    | undefined

  constructor({
    name,
    attributes,
    delegateSpan,
    traceId,
    spanId,
  }: {
    name: string
    attributes?: LocalSpanAttributes
    delegateSpan?: Span
    traceId: string
    spanId: string
  }) {
    this.name = name
    this.attributes = cleanSpanStoreAttributes(attributes)
    this.delegateSpan = delegateSpan
    this.spanContextValue = delegateSpan?.spanContext() ?? {
      traceId,
      spanId,
      traceFlags: 0,
    }
  }

  spanContext(): ReturnType<Span['spanContext']> {
    return this.spanContextValue
  }

  setAttribute(key: string, value: AttributeValue): this {
    setSpanStoreAttribute(this.attributes, key, value)
    this.delegateSpan?.setAttribute(key, value)
    return this
  }

  setAttributes(attributes: Parameters<Span['setAttributes']>[0]): this {
    addSpanStoreAttributes(this.attributes, attributes)
    this.delegateSpan?.setAttributes(attributes)
    return this
  }

  addEvent(
    name: string,
    attributesOrStartTime?: Parameters<Span['addEvent']>[1],
    startTime?: Parameters<Span['addEvent']>[2]
  ): this {
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
    this.statusCode = status.code
    this.statusMessage = status.message
    this.delegateSpan?.setStatus(status)
    return this
  }

  updateName(name: string): this {
    this.name = name
    this.delegateSpan?.updateName(name)
    return this
  }

  end(endTime?: Parameters<Span['end']>[0]): void {
    this.delegateSpan?.end(endTime)
  }

  isRecording(): boolean {
    return this.delegateSpan?.isRecording() ?? true
  }

  recordException(
    exception: Parameters<Span['recordException']>[0],
    time?: Parameters<Span['recordException']>[1]
  ): void {
    this.exception = getSpanStoreException(exception)
    this.events.push({
      name: 'exception',
      timestamp: Date.now(),
      attributes: getSpanStoreExceptionAttributes(this.exception),
    })
    this.delegateSpan?.recordException(exception, time)
  }

  getAttributes(): SpanStoreAttributes | undefined {
    return Object.keys(this.attributes).length > 0 ? this.attributes : undefined
  }

  getEvents(): SpanStoreEvent[] | undefined {
    return this.events.length > 0 ? this.events : undefined
  }

  getRecordStatus(error?: Error): 'ok' | 'error' {
    return error || this.statusCode === SpanStatusCode.ERROR ? 'error' : 'ok'
  }

  getRecordError(error?: Error):
    | {
        type?: string
        message?: string
      }
    | undefined {
    if (error) {
      return {
        type: error.name,
        message: error.message,
      }
    }

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
  addSpanStoreAttributes(cleanedAttributes, attributes)
  return cleanedAttributes
}

function addSpanStoreAttributes(
  target: SpanStoreAttributes,
  attributes:
    | Record<string, AttributeValue | undefined>
    | SpanStoreAttributes
    | undefined
) {
  if (!attributes) {
    return
  }

  for (const [key, value] of Object.entries(attributes)) {
    setSpanStoreAttribute(target, key, value)
  }
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
  setSpanStoreAttribute(attributes, 'exception.type', exception.type)
  setSpanStoreAttribute(attributes, 'exception.message', exception.message)
  return Object.keys(attributes).length > 0 ? attributes : undefined
}

function setSpanStoreAttribute(
  attributes: SpanStoreAttributes,
  key: string,
  value: AttributeValue | undefined
) {
  if (value !== undefined) {
    attributes[key] = value
  }
}

function getLocalTraceIdForCurrentStore(): string {
  const { workStore, workUnitStore } = getCurrentAsyncStorageStores()
  return (
    getLocalTraceIdForStore(workStore ?? workUnitStore) ?? getLocalTraceId()
  )
}

function getCurrentAsyncStorageStores(): {
  workStore?: {
    requestId?: string
    htmlRequestId?: string
    route?: string
  }
  workUnitStore?: object
} {
  try {
    const { workAsyncStorage } =
      require('../../app-render/work-async-storage.external') as typeof import('../../app-render/work-async-storage.external')
    const { workUnitAsyncStorage } =
      require('../../app-render/work-unit-async-storage.external') as typeof import('../../app-render/work-unit-async-storage.external')

    return {
      workStore: workAsyncStorage.getStore(),
      workUnitStore: workUnitAsyncStorage.getStore(),
    }
  } catch {
    return {}
  }
}

function getLocalTraceIdForStore(
  store: object | undefined
): string | undefined {
  if (!store) {
    return undefined
  }

  let traceId = localTraceIdByStore.get(store)
  if (!traceId) {
    traceId = getLocalTraceId()
    localTraceIdByStore.set(store, traceId)
  }
  return traceId
}

function getCurrentRequestIdentity(): {
  requestId?: string
  htmlRequestId?: string
  route?: string
  url?: string
} {
  const { workStore, workUnitStore } = getCurrentAsyncStorageStores()
  const url =
    workUnitStore && 'url' in workUnitStore && isRequestUrl(workUnitStore.url)
      ? workUnitStore.url
      : undefined
  return {
    requestId: workStore?.requestId,
    htmlRequestId: workStore?.htmlRequestId,
    route: workStore?.route,
    url: url ? `${url.pathname}${url.search}` : undefined,
  }
}

function isRequestUrl(
  value: unknown
): value is { pathname: string; search: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pathname' in value &&
    'search' in value &&
    typeof value.pathname === 'string' &&
    typeof value.search === 'string'
  )
}
