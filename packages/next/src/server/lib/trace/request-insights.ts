import type { AttributeValue } from 'next/dist/compiled/@opentelemetry/api'
import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightsSnapshot,
} from '../../../next-devtools/shared/request-insights'
import type { SpanStoreRecord } from './span-store'
export { isRequestInsightsEnabled } from './span-store'

const MAX_REQUEST_INSIGHTS = 100
const REQUEST_INSIGHTS_STORE_KEY = Symbol.for('@next/request-insights-store')
const CLIENT_COMPONENT_LOADING_SPAN_TYPE =
  'NextNodeServer.clientComponentLoading'

type RequestInsightsListener = (insight: RequestInsight) => void
type RequestInsightIdentity = {
  requestId?: string
  htmlRequestId?: string
  route?: string
  url?: string
}

const REDACTED_VALUE = 'redacted'
const SAFE_SPAN_ATTRIBUTE_KEYS = new Set([
  'http.method',
  'http.route',
  'http.status_code',
  'http.url',
  'net.peer.name',
  'net.peer.port',
  'next.fetch.cache_reason',
  'next.fetch.cache_status',
  'next.fetch.idx',
  'next.route',
  'next.rsc',
  'next.segment',
  'next.span_category',
  'next.span_name',
  'next.span_type',
])
const SENSITIVE_PARAM_NAME_RE =
  /(?:^|[_-])(?:access[_-]?token|api[_-]?key|auth|authorization|code|cookie|credential|id[_-]?token|jwt|key|password|secret|session|signature|sig|token)(?:$|[_-])/i

class InMemoryRequestInsightsStore {
  private readonly requests = new Map<string, RequestInsight>()
  private readonly requestTimings = new Map<
    string,
    { startTime: number; durationMs: number }
  >()
  private readonly requestOrder: string[] = []
  private readonly listeners = new Set<RequestInsightsListener>()

  recordSpan(span: SpanStoreRecord): void {
    if (!span.requestId) {
      return
    }

    const insight = this.getOrCreateRequest(
      span,
      span.startTime ?? span.timestamp
    )

    const spanStartTime = span.startTime ?? span.timestamp
    insight.htmlRequestId = span.htmlRequestId ?? insight.htmlRequestId
    insight.route = insight.route ?? span.route
    insight.url = insight.url ?? sanitizeUrl(span.url)
    this.updateTiming(
      insight,
      spanStartTime,
      span.durationMs,
      span.attributes?.['next.span_type'] === 'BaseServer.handleRequest'
    )
    insight.status =
      insight.status === 'error' || span.status === 'error'
        ? 'error'
        : span.status === 'ok'
          ? 'ok'
          : insight.status

    insight.spans.push({
      name: span.name,
      startTime: spanStartTime,
      durationMs: span.durationMs,
      status: span.status,
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      attributes: sanitizeSpanAttributes(span.attributes),
      links: sanitizeSpanLinks(span.links),
      events: sanitizeSpanEvents(span.events),
      error: span.error,
    })

    const fetch = getFetchInsight(span)
    if (fetch) {
      this.recordFetchForInsight(insight, fetch)
    }

    this.notify(insight)
  }

  recordFetch(identity: RequestInsightIdentity, fetch: RequestInsightFetch) {
    if (!identity.requestId) {
      return
    }

    const fetchStartTime = fetch.startTime ?? Date.now()
    const insight = this.getOrCreateRequest(identity, fetchStartTime)
    this.updateTiming(insight, fetchStartTime, fetch.durationMs, false)
    this.recordFetchForInsight(insight, sanitizeFetchInsight(fetch))
    this.notify(insight)
  }

  getSnapshot(): RequestInsightsSnapshot {
    return {
      requests: this.requestOrder
        .map((requestId) => this.requests.get(requestId))
        .filter((request): request is RequestInsight => request !== undefined),
    }
  }

  subscribe(listener: RequestInsightsListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  clear(): void {
    this.requests.clear()
    this.requestTimings.clear()
    this.requestOrder.length = 0
  }

  private updateTiming(
    insight: RequestInsight,
    startTime: number,
    durationMs: number | undefined,
    isRequestSpan: boolean
  ): void {
    if (isRequestSpan && durationMs !== undefined) {
      const requestTiming = { startTime, durationMs }
      this.requestTimings.set(insight.requestId, requestTiming)
      insight.startTime = requestTiming.startTime
      insight.durationMs = requestTiming.durationMs
      return
    }

    const requestTiming = this.requestTimings.get(insight.requestId)
    if (requestTiming) {
      insight.startTime = requestTiming.startTime
      insight.durationMs = requestTiming.durationMs
      return
    }

    const endTime = startTime + (durationMs ?? 0)
    const requestEndTime = insight.startTime + (insight.durationMs ?? 0)
    insight.startTime = Math.min(insight.startTime, startTime)
    insight.durationMs = Math.max(requestEndTime, endTime) - insight.startTime
  }

  private notify(insight: RequestInsight): void {
    for (const listener of this.listeners) {
      listener(insight)
    }
  }

  private getOrCreateRequest(
    identity: RequestInsightIdentity,
    startTime: number
  ): RequestInsight {
    const requestId = identity.requestId!
    let insight = this.requests.get(requestId)

    if (!insight) {
      insight = {
        requestId,
        htmlRequestId: identity.htmlRequestId ?? requestId,
        route: identity.route,
        url: sanitizeUrl(identity.url),
        startTime,
        status: 'pending',
        spans: [],
        fetches: [],
      }
      this.requests.set(requestId, insight)
      this.requestOrder.push(requestId)
      this.trim()
    }

    insight.htmlRequestId = identity.htmlRequestId ?? insight.htmlRequestId
    insight.route = insight.route ?? identity.route
    insight.url = insight.url ?? sanitizeUrl(identity.url)
    insight.startTime = Math.min(insight.startTime, startTime)

    return insight
  }

  private recordFetchForInsight(
    insight: RequestInsight,
    fetch: RequestInsightFetch
  ): void {
    if (
      insight.fetches.some(
        (existingFetch) =>
          existingFetch.url === fetch.url &&
          (existingFetch.index !== undefined && fetch.index !== undefined
            ? existingFetch.index === fetch.index
            : existingFetch.startTime === fetch.startTime)
      )
    ) {
      return
    }

    insight.fetches.push(sanitizeFetchInsight(fetch))
  }

  private trim(): void {
    while (this.requestOrder.length > MAX_REQUEST_INSIGHTS) {
      const requestId = this.requestOrder.shift()
      if (requestId) {
        this.requests.delete(requestId)
        this.requestTimings.delete(requestId)
      }
    }
  }
}

export function recordRequestInsightSpan(span: SpanStoreRecord): void {
  if (
    span.attributes?.['next.span_type'] === CLIENT_COMPONENT_LOADING_SPAN_TYPE
  ) {
    return
  }

  getRequestInsightsStore().recordSpan(span)
}

export function recordRequestInsightFetch(
  identity: RequestInsightIdentity,
  fetch: RequestInsightFetch
): void {
  getRequestInsightsStore().recordFetch(identity, fetch)
}

export function getRequestInsightsSnapshot(): RequestInsightsSnapshot {
  return getRequestInsightsStore().getSnapshot()
}

export function subscribeRequestInsights(
  listener: RequestInsightsListener
): () => void {
  return getRequestInsightsStore().subscribe(listener)
}

export function clearRequestInsightsForTest(): void {
  getRequestInsightsStore().clear()
}

function getRequestInsightsStore(): InMemoryRequestInsightsStore {
  const globalStore = globalThis as typeof globalThis & {
    [REQUEST_INSIGHTS_STORE_KEY]?: InMemoryRequestInsightsStore
  }

  return (globalStore[REQUEST_INSIGHTS_STORE_KEY] ??=
    new InMemoryRequestInsightsStore())
}

function getFetchInsight(span: SpanStoreRecord): RequestInsightFetch | null {
  const attributes = span.attributes

  if (!attributes || attributes['next.span_type'] !== 'AppRender.fetch') {
    return null
  }

  return {
    url: sanitizeUrl(getStringAttribute(attributes['http.url']) ?? span.url),
    method: getStringAttribute(attributes['http.method']),
    statusCode: getNumberAttribute(attributes['http.status_code']),
    startTime: span.startTime ?? span.timestamp,
    durationMs: span.durationMs,
    cacheStatus: getStringAttribute(attributes['next.fetch.cache_status']),
    cacheReason: getStringAttribute(attributes['next.fetch.cache_reason']),
    index: getNumberAttribute(attributes['next.fetch.idx']),
  }
}

function sanitizeFetchInsight(fetch: RequestInsightFetch): RequestInsightFetch {
  return {
    ...fetch,
    url: sanitizeUrl(fetch.url),
  }
}

function sanitizeSpanAttributes(
  attributes: SpanStoreRecord['attributes']
): SpanStoreRecord['attributes'] {
  if (!attributes) {
    return undefined
  }

  const sanitized: NonNullable<SpanStoreRecord['attributes']> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (!SAFE_SPAN_ATTRIBUTE_KEYS.has(key)) {
      continue
    }

    sanitized[key] = key === 'http.url' ? sanitizeUrlAttribute(value) : value
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function sanitizeSpanEvents(
  events: SpanStoreRecord['events']
): SpanStoreRecord['events'] {
  return events?.map((event) => ({
    ...event,
    attributes: sanitizeSpanAttributes(event.attributes),
  }))
}

function sanitizeSpanLinks(
  links: SpanStoreRecord['links']
): SpanStoreRecord['links'] {
  return links?.map((link) => ({
    ...link,
    attributes: sanitizeSpanAttributes(link.attributes),
  }))
}

function sanitizeUrlAttribute(value: AttributeValue): AttributeValue {
  return typeof value === 'string' ? (sanitizeUrl(value) ?? '') : value
}

function sanitizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return value
  }

  const isRelativeUrl = value.startsWith('/')

  try {
    const url = isRelativeUrl ? new URL(value, 'http://n') : new URL(value)

    url.username = ''
    url.password = ''

    for (const name of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_PARAM_NAME_RE.test(name)) {
        url.searchParams.set(name, REDACTED_VALUE)
      }
    }

    return isRelativeUrl ? `${url.pathname}${url.search}${url.hash}` : url.href
  } catch {
    return value
  }
}

function getStringAttribute(value: AttributeValue | undefined) {
  return typeof value === 'string' ? value : undefined
}

function getNumberAttribute(value: AttributeValue | undefined) {
  return typeof value === 'number' ? value : undefined
}
