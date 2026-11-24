import type { AttributeValue } from 'next/dist/compiled/@opentelemetry/api'
import {
  getRequestInsightKey,
  getRequestInsightKind,
  getRequestInsightSource,
  isSameRequestInsightFetch,
  MAX_LIVE_COMPLETED_REQUEST_INSIGHTS,
  REQUEST_INSIGHT_PROXY_SPAN_TYPE,
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  type RequestInsight,
  type RequestInsightFetch,
  type RequestInsightKind,
  type RequestInsightProxyStatus,
  type RequestInsightSource,
  type RequestInsightSpan,
  type RequestInsightsSnapshot,
} from '../../../shared/lib/request-insights'
import {
  isRequestInsightsEnabled,
  recordSpans,
  setLocalSpanExporter,
  type LocalSpanBatch,
  type LocalSpanParent,
  type SpanStoreRecord,
} from './span-store'
import { getRequestIsRsc } from '../../../shared/lib/request-insights-summary'
import type { RequestInsightsIdentity } from './request-insights-identity'
import { reparentLocalSpans } from './local-span-recorder'
import { AppRenderSpan } from './constants'
export { isRequestInsightsEnabled }

const MAX_REQUEST_INSIGHT_URL_LENGTH = 2048
const MAX_REQUEST_INSIGHT_RAW_URL_LENGTH = 64 * 1024
const REQUEST_INSIGHTS_STORE_KEY = Symbol.for('@next/request-insights-store')
const CLIENT_COMPONENT_LOADING_SPAN_TYPE =
  'NextNodeServer.clientComponentLoading'

type RequestInsightsListener = (insight: RequestInsight) => void
type RequestInsightIdentity = Readonly<{
  requestId?: string
  parentRequestId?: string
  kind?: RequestInsightKind
  source?: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  htmlRequestId?: string
  route?: string
  url?: string
}>

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
  'next.request_insights.omitted_spans',
  'next.rsc',
  'next.segment',
  'next.span_category',
  'next.span_name',
  'next.span_type',
])
class InMemoryRequestInsightsStore {
  private readonly activeRequests = new Set<string>()
  private readonly requests = new Map<string, RequestInsight>()
  private readonly requestTimings = new Map<
    string,
    { startTime: number; durationMs: number }
  >()
  private readonly requestOrder: string[] = []
  private readonly completedRequestOrder: string[] = []
  private readonly listeners = new Set<RequestInsightsListener>()

  startRequest(identity: RequestInsightIdentity): void {
    if (!identity.requestId) {
      return
    }
    const insightKey = getRequestInsightKey({
      requestId: identity.requestId,
      kind: identity.kind,
    })
    if (this.requests.get(insightKey)?.completedAt === undefined) {
      this.activeRequests.add(insightKey)
    }
  }

  recordSpan(
    span: SpanStoreRecord,
    shouldNotify: boolean = true
  ): RequestInsight | undefined {
    if (!span.requestId) {
      return
    }

    const recordedSpan = sanitizeRecordedSpan(span)
    const fetch = getFetchInsight(span) ?? undefined
    const insight = this.getOrCreateRequest(
      {
        requestId: span.requestId,
        parentRequestId: span.parentRequestId,
        kind: span.requestInsightKind,
        source: span.requestInsightSource,
        proxyStatus: span.requestInsightProxyStatus,
        htmlRequestId: span.htmlRequestId,
        route: span.route,
        url: span.url,
      },
      span.startTime ?? span.timestamp
    )
    if (!insight) {
      return
    }

    const spanStartTime = span.startTime ?? span.timestamp
    insight.htmlRequestId = span.htmlRequestId ?? insight.htmlRequestId
    this.updateClassification(
      insight,
      {
        kind: span.requestInsightKind,
        source: span.requestInsightSource,
        proxyStatus: span.requestInsightProxyStatus,
      },
      span
    )
    insight.route = insight.route ?? span.route
    insight.url = insight.url ?? sanitizeUrl(span.url)
    const spanType = span.attributes?.['next.span_type']
    const isRequestSpan = spanType === REQUEST_INSIGHT_REQUEST_SPAN_TYPE
    if (insight.completedAt === undefined) {
      this.updateTiming(insight, spanStartTime, span.durationMs, isRequestSpan)
    }
    insight.status =
      insight.status === 'error' || span.status === 'error'
        ? 'error'
        : span.status === 'ok'
          ? 'ok'
          : insight.status

    insight.spans.push(recordedSpan)
    if (fetch) this.recordFetchForInsight(insight, fetch)

    if (
      span.durationMs !== undefined &&
      spanType === AppRenderSpan.instantInsights
    ) {
      this.complete(insight, spanStartTime + span.durationMs)
    }

    if (shouldNotify) {
      this.notify(insight)
    }
    return insight
  }

  recordSpans(spans: readonly SpanStoreRecord[]): void {
    const updatedInsights = new Set<RequestInsight>()
    for (const span of spans) {
      const insight = this.recordSpan(span, false)
      if (insight) {
        updatedInsights.add(insight)
      }
    }
    for (const insight of updatedInsights) {
      this.notify(insight)
    }
  }

  recordFetch(identity: RequestInsightIdentity, fetch: RequestInsightFetch) {
    if (!identity.requestId) {
      return
    }

    const sanitizedFetch = sanitizeFetchInsight(fetch)
    const fetchStartTime = fetch.startTime ?? getCurrentTimestamp()
    const insight = this.getOrCreateRequest(identity, fetchStartTime)
    if (!insight) {
      return
    }
    if (insight.completedAt === undefined) {
      this.updateTiming(insight, fetchStartTime, fetch.durationMs, false)
    }
    this.recordFetchForInsight(insight, sanitizedFetch)
    this.notify(insight)
  }

  recordClassification(identity: RequestInsightIdentity): void {
    if (!identity.requestId) {
      return
    }

    const insight = this.requests.get(
      getRequestInsightKey({
        requestId: identity.requestId,
        kind: identity.kind,
      })
    )
    if (!insight) {
      return
    }

    this.updateClassification(insight, identity)
    this.notify(insight)
  }

  completeRequest(identity: RequestInsightIdentity): void {
    if (!identity.requestId) {
      return
    }

    const insightKey = getRequestInsightKey({
      requestId: identity.requestId,
      kind: identity.kind,
    })
    this.activeRequests.delete(insightKey)
    const insight = this.requests.get(insightKey)
    if (!insight || insight.completedAt !== undefined) {
      return
    }

    this.complete(insight, getCurrentTimestamp())
    this.notify(insight)
  }

  getSnapshot(): RequestInsightsSnapshot {
    return {
      requests: this.requestOrder
        .map((insightKey) => this.requests.get(insightKey))
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
    this.activeRequests.clear()
    this.requests.clear()
    this.requestTimings.clear()
    this.requestOrder.length = 0
    this.completedRequestOrder.length = 0
  }

  private updateTiming(
    insight: RequestInsight,
    startTime: number,
    durationMs: number | undefined,
    isRequestSpan: boolean
  ): void {
    const insightKey = getRequestInsightKey(insight)
    if (isRequestSpan && durationMs !== undefined) {
      const previousTiming = this.requestTimings.get(insightKey) ?? {
        startTime,
        durationMs,
      }
      const requestStart = Math.min(previousTiming.startTime, startTime)
      const requestTiming = {
        startTime: requestStart,
        durationMs:
          Math.max(
            previousTiming.startTime + previousTiming.durationMs,
            startTime + durationMs
          ) - requestStart,
      }
      this.requestTimings.set(insightKey, requestTiming)
      insight.startTime = requestTiming.startTime
      insight.durationMs = requestTiming.durationMs
      return
    }

    const requestTiming = this.requestTimings.get(insightKey)
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
  ): RequestInsight | undefined {
    const requestId = identity.requestId!
    const insightKey = getRequestInsightKey({
      requestId,
      kind: identity.kind,
    })
    let insight = this.requests.get(insightKey)

    if (!insight) {
      // Only request start can authorize a new row. Missing history may have
      // been discarded, even when a late span still carries its request ID.
      if (!this.activeRequests.has(insightKey)) {
        return
      }
      insight = {
        requestId,
        parentRequestId: identity.parentRequestId,
        kind: getRequestInsightKind(identity),
        source: getRequestInsightSource(identity),
        proxyStatus: identity.proxyStatus,
        htmlRequestId: identity.htmlRequestId ?? requestId,
        route: identity.route,
        url: sanitizeUrl(identity.url),
        startTime,
        status: 'pending',
        spans: [],
        fetches: [],
      }
      this.requests.set(insightKey, insight)
      this.requestOrder.push(insightKey)
    }

    insight.htmlRequestId = identity.htmlRequestId ?? insight.htmlRequestId
    insight.parentRequestId =
      identity.parentRequestId ?? insight.parentRequestId
    this.updateClassification(insight, identity)
    insight.route = insight.route ?? identity.route
    insight.url = insight.url ?? sanitizeUrl(identity.url)
    if (insight.completedAt === undefined) {
      insight.startTime = Math.min(insight.startTime, startTime)
    }

    return insight
  }

  private updateClassification(
    insight: RequestInsight,
    identity: RequestInsightIdentity,
    span?: SpanStoreRecord
  ): void {
    const source = identity.source ?? getSourceFromSpan(span)
    insight.source = refineSource(insight.source, source)
    insight.proxyStatus = identity.proxyStatus ?? insight.proxyStatus
  }

  private recordFetchForInsight(
    insight: RequestInsight,
    fetch: RequestInsightFetch
  ): boolean {
    const existingFetch = insight.fetches.find((candidate) =>
      isSameRequestInsightFetch(candidate, fetch)
    )
    if (existingFetch) {
      existingFetch.parentSpanId ??= fetch.parentSpanId
      return false
    }

    insight.fetches.push(sanitizeFetchInsight(fetch))
    return true
  }

  private complete(insight: RequestInsight, completedAt: number): void {
    if (insight.completedAt !== undefined) {
      return
    }

    const insightKey = getRequestInsightKey(insight)
    this.activeRequests.delete(insightKey)
    insight.completedAt = completedAt
    this.completedRequestOrder.push(insightKey)

    const requestIndex = this.requestOrder.indexOf(insightKey)
    if (requestIndex !== -1) {
      this.requestOrder.splice(requestIndex, 1)
      this.requestOrder.push(insightKey)
    }

    while (
      this.completedRequestOrder.length > MAX_LIVE_COMPLETED_REQUEST_INSIGHTS
    ) {
      let latestRsc: string | undefined
      let latestPage: string | undefined
      for (
        let index = this.completedRequestOrder.length - 1;
        index >= 0;
        index--
      ) {
        const key = this.completedRequestOrder[index]
        const request = this.requests.get(key)
        if (request?.source !== 'page') continue
        const isRsc = getRequestIsRsc(request)
        if (isRsc === true && !latestRsc) latestRsc = key
        if (isRsc === false && !latestPage) latestPage = key
        if (latestRsc && latestPage) break
      }
      const evictIndex = this.completedRequestOrder.findIndex(
        (key) => key !== latestRsc && key !== latestPage
      )
      const [completedInsightKey] = this.completedRequestOrder.splice(
        evictIndex,
        1
      )
      if (completedInsightKey) {
        this.requests.delete(completedInsightKey)
        this.requestTimings.delete(completedInsightKey)
        const completedIndex = this.requestOrder.indexOf(completedInsightKey)
        if (completedIndex !== -1) {
          this.requestOrder.splice(completedIndex, 1)
        }
      }
    }
  }
}

export function registerRequestInsightsExporter(): void {
  setLocalSpanExporter({
    isEnabled: isRequestInsightsEnabled,
    export(spans) {
      getRequestInsightsStore().recordSpans(
        spans.filter(
          (span) =>
            span.attributes?.['next.span_type'] !==
            CLIENT_COMPONENT_LOADING_SPAN_TYPE
        )
      )
    },
  })
}

function sanitizeRecordedSpan(span: SpanStoreRecord): RequestInsightSpan {
  const preserveAttributes =
    span.attributes?.['next.span_category'] === 'opentelemetry'
  return {
    name: sanitizeSpanName(span),
    startTime: span.startTime ?? span.timestamp,
    durationMs: span.durationMs,
    status: span.status,
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    attributes: sanitizeSpanAttributes(span.attributes, preserveAttributes),
    links: sanitizeSpanLinks(span.links, preserveAttributes),
    events: sanitizeSpanEvents(span.events, preserveAttributes),
    error: span.error,
  }
}

function refineSource(
  current: RequestInsightSource,
  candidate: RequestInsightSource | undefined
): RequestInsightSource {
  if (!candidate || candidate === 'unknown') {
    return current
  }
  if (
    candidate === 'app-route' ||
    candidate === 'pages-api' ||
    candidate === 'image' ||
    candidate === 'asset' ||
    candidate === 'instant-insights'
  ) {
    return candidate
  }
  if (current === 'unknown' || current === 'proxy') {
    return candidate
  }
  return current
}

export function recordRequestInsightSpan(span: SpanStoreRecord): void {
  if (!shouldRecordRequestInsightSpan(span)) {
    return
  }

  getRequestInsightsStore().recordSpan(span)
}

export function importRequestInsightSpans(
  identity: RequestInsightsIdentity,
  parent: LocalSpanParent,
  batch: LocalSpanBatch
): void {
  recordSpans(
    reparentLocalSpans(
      parent,
      batch.spans.filter(shouldRecordRequestInsightSpan)
    ).map((span) => ({
      ...span,
      requestId: identity.requestId,
      requestInsightKind: identity.kind,
      requestInsightSource: identity.source,
      requestInsightProxyStatus: identity.proxyStatus,
      htmlRequestId: identity.htmlRequestId,
      url: identity.url,
    }))
  )
}

function shouldRecordRequestInsightSpan(span: SpanStoreRecord): boolean {
  return (
    span.attributes?.['next.span_type'] !== CLIENT_COMPONENT_LOADING_SPAN_TYPE
  )
}

export function recordRequestInsightFetch(
  identity: RequestInsightIdentity,
  fetch: RequestInsightFetch
): void {
  getRequestInsightsStore().recordFetch(identity, fetch)
}

export function recordRequestInsightSource(
  identity: RequestInsightIdentity,
  source: RequestInsightSource
): void {
  getRequestInsightsStore().recordClassification({ ...identity, source })
}

export function completeRequestInsight(identity: RequestInsightIdentity): void {
  getRequestInsightsStore().completeRequest(identity)
}

export function startRequestInsight(identity: RequestInsightIdentity): void {
  if (isRequestInsightsEnabled()) {
    getRequestInsightsStore().startRequest(identity)
  }
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
    parentSpanId: span.parentSpanId,
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

function getSourceFromSpan(
  span: SpanStoreRecord | undefined
): RequestInsightSource | undefined {
  if (!span) {
    return undefined
  }

  const spanType = getStringAttribute(span.attributes?.['next.span_type'])
  if (spanType === 'AppRouteRouteHandlers.runHandler') {
    return 'app-route'
  }
  if (spanType === 'Node.runHandler') {
    return 'pages-api'
  }
  if (spanType === 'NextNodeServer.imageOptimizer') {
    return 'image'
  }
  if (spanType === REQUEST_INSIGHT_REQUEST_SPAN_TYPE) {
    return 'page'
  }
  if (spanType === REQUEST_INSIGHT_PROXY_SPAN_TYPE) {
    return 'proxy'
  }
  return undefined
}

function sanitizeFetchInsight(fetch: RequestInsightFetch): RequestInsightFetch {
  return {
    ...fetch,
    url: sanitizeUrl(fetch.url),
  }
}

function getCurrentTimestamp(): number {
  return performance.timeOrigin + performance.now()
}

function sanitizeSpanAttributes(
  attributes: SpanStoreRecord['attributes'],
  preserveAll = false
): SpanStoreRecord['attributes'] {
  if (!attributes) {
    return undefined
  }

  const sanitized: NonNullable<SpanStoreRecord['attributes']> = {}
  const sanitizedFetchSpanName =
    attributes['next.span_type'] === 'AppRender.fetch'
      ? getSanitizedFetchSpanName(attributes)
      : undefined
  for (const [key, value] of Object.entries(attributes)) {
    if (!preserveAll && !SAFE_SPAN_ATTRIBUTE_KEYS.has(key)) {
      continue
    }

    sanitized[key] = preserveAll
      ? value
      : key === 'http.url'
        ? sanitizeUrlAttribute(value)
        : key === 'next.span_name' && sanitizedFetchSpanName
          ? sanitizedFetchSpanName
          : value
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function sanitizeSpanName(span: SpanStoreRecord): string {
  if (span.attributes?.['next.span_type'] !== 'AppRender.fetch') {
    return span.name
  }

  return getSanitizedFetchSpanName(span.attributes, span.url)
}

function getSanitizedFetchSpanName(
  attributes: NonNullable<SpanStoreRecord['attributes']>,
  fallbackUrl?: string
): string {
  const method = getStringAttribute(attributes['http.method'])
  const url = sanitizeUrl(
    getStringAttribute(attributes['http.url']) ?? fallbackUrl
  )
  return ['fetch', method, url].filter(Boolean).join(' ')
}

function sanitizeSpanEvents(
  events: SpanStoreRecord['events'],
  preserveAttributes = false
): SpanStoreRecord['events'] {
  return events?.map((event) => ({
    ...event,
    attributes: sanitizeSpanAttributes(event.attributes, preserveAttributes),
  }))
}

function sanitizeSpanLinks(
  links: SpanStoreRecord['links'],
  preserveAttributes = false
): SpanStoreRecord['links'] {
  return links?.map((link) => ({
    ...link,
    attributes: sanitizeSpanAttributes(link.attributes, preserveAttributes),
  }))
}

function sanitizeUrlAttribute(value: AttributeValue): AttributeValue {
  return typeof value === 'string' ? (sanitizeUrl(value) ?? '') : value
}

function sanitizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return value
  }

  if (value.length > MAX_REQUEST_INSIGHT_RAW_URL_LENGTH) {
    return undefined
  }

  const isProtocolRelativeUrl = value.startsWith('//')
  const isRootRelativeUrl = !isProtocolRelativeUrl && value.startsWith('/')
  const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(value)

  if (!isProtocolRelativeUrl && !isRootRelativeUrl && !hasProtocol) {
    return undefined
  }

  try {
    const url =
      isProtocolRelativeUrl || isRootRelativeUrl
        ? new URL(value, 'http://n')
        : new URL(value)

    if (
      url.protocol !== 'http:' &&
      url.protocol !== 'https:' &&
      !isProtocolRelativeUrl &&
      !isRootRelativeUrl
    ) {
      return `${url.protocol}${REDACTED_VALUE}`
    }

    url.username = ''
    url.password = ''
    url.hash = ''

    const hasApplicationQuery = Array.from(url.searchParams.keys()).some(
      (name) => name !== '_rsc'
    )
    url.search = hasApplicationQuery ? `?query=${REDACTED_VALUE}` : ''

    const sanitizedUrl = isProtocolRelativeUrl
      ? `//${url.host}${url.pathname}${url.search}`
      : isRootRelativeUrl
        ? `${url.pathname}${url.search}`
        : url.href

    return truncateText(sanitizedUrl, MAX_REQUEST_INSIGHT_URL_LENGTH)
  } catch {
    return undefined
  }
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  let end = Math.max(0, maxLength - 1)
  if (end > 0) {
    const lastCharCode = value.charCodeAt(end - 1)
    if (lastCharCode >= 0xd800 && lastCharCode <= 0xdbff) {
      end--
    }
  }
  return `${value.slice(0, end)}…`
}

function getStringAttribute(value: AttributeValue | undefined) {
  return typeof value === 'string' ? value : undefined
}

function getNumberAttribute(value: AttributeValue | undefined) {
  return typeof value === 'number' ? value : undefined
}
