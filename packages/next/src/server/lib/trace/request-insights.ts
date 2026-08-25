import type { AttributeValue } from 'next/dist/compiled/@opentelemetry/api'
import {
  MAX_LIVE_COMPLETED_REQUEST_INSIGHTS,
  type RequestInsight,
  type RequestInsightFetch,
  type RequestInsightsSnapshot,
} from '../../../next-devtools/shared/request-insights'
import type {
  RequestInsightFilter,
  RequestInsightsHistoryPage,
} from '../../../next-devtools/shared/request-insights-summary'
import type { RequestInsightKind } from '../../../shared/lib/request-insights'
import {
  getRequestInsightKey,
  getRequestInsightKind,
  getRequestInsightSource,
  REQUEST_INSIGHT_PROXY_SPAN_TYPE,
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  type RequestInsightProxyStatus,
  type RequestInsightSource,
} from '../../../shared/lib/request-insights'
import type {
  LocalSpanBatch,
  LocalSpanParent,
  SpanStoreRecord,
} from './span-store'
import type { RequestInsightsIdentity } from './request-insights-identity'
import { createLocalSpanId } from './local-span-recorder'
import { AppRenderSpan } from './constants'
export { isRequestInsightsEnabled } from './span-store'

const MAX_REQUEST_INSIGHT_URL_LENGTH = 2048
const MAX_REQUEST_INSIGHT_RAW_URL_LENGTH = 64 * 1024
const REQUEST_INSIGHTS_STORE_KEY = Symbol.for('@next/request-insights-store')
const REQUEST_INSIGHTS_HISTORY_PROVIDER_KEY = Symbol.for(
  `@next/request-insights-history-provider@${process.env.__NEXT_VERSION}`
)
const CLIENT_COMPONENT_LOADING_SPAN_TYPE =
  'NextNodeServer.clientComponentLoading'

type RequestInsightsListener = (insight: RequestInsight) => void
type RequestInsightIdentity = Readonly<{
  requestId?: string
  kind?: RequestInsightKind
  source?: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  htmlRequestId?: string
  route?: string
  url?: string
}>

export type RequestInsightsHistoryQuery = {
  cursor?: string
  filters?: readonly RequestInsightFilter[]
  limit?: number
  showInternal?: boolean
}

export type RequestInsightsJournalQuery = {
  requestId?: string
  htmlRequestId?: string
  kind?: RequestInsight['kind']
  limit?: number
}

export type RequestInsightsHistoryProvider = {
  append(request: RequestInsight): void
  getHistory(
    query?: RequestInsightsHistoryQuery
  ): Promise<RequestInsightsHistoryPage>
  read(query?: RequestInsightsJournalQuery): Promise<RequestInsight[]>
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
  'next.request_source',
  'next.request_insights.omitted_spans',
  'next.rsc',
  'next.segment',
  'next.span_category',
  'next.span_name',
  'next.span_type',
])
class InMemoryRequestInsightsStore {
  private readonly requests = new Map<string, RequestInsight>()
  private readonly requestTimings = new Map<
    string,
    { startTime: number; durationMs: number }
  >()
  private readonly requestOrder: string[] = []
  private readonly completedRequestOrder: string[] = []
  private readonly listeners = new Set<RequestInsightsListener>()

  recordSpan(
    span: SpanStoreRecord,
    shouldNotify: boolean = true
  ): RequestInsight | undefined {
    if (!span.requestId) {
      return
    }

    const insight = this.getOrCreateRequest(
      {
        requestId: span.requestId,
        kind: span.requestInsightKind,
        source: span.requestInsightSource,
        proxyStatus: span.requestInsightProxyStatus,
        htmlRequestId: span.htmlRequestId,
        route: span.route,
        url: span.url,
      },
      span.startTime ?? span.timestamp
    )

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
    this.updateTiming(insight, spanStartTime, span.durationMs, isRequestSpan)
    insight.status =
      insight.status === 'error' || span.status === 'error'
        ? 'error'
        : span.status === 'ok'
          ? 'ok'
          : insight.status

    insight.spans.push({
      name: sanitizeSpanName(span),
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

  recordSpans(spans: SpanStoreRecord[]): void {
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

    const fetchStartTime = fetch.startTime ?? getCurrentTimestamp()
    const insight = this.getOrCreateRequest(identity, fetchStartTime)
    this.updateTiming(insight, fetchStartTime, fetch.durationMs, false)
    this.recordFetchForInsight(insight, sanitizeFetchInsight(fetch))
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

    const insight = this.requests.get(
      getRequestInsightKey({
        requestId: identity.requestId,
        kind: identity.kind,
      })
    )
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
      const requestTiming = { startTime, durationMs }
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
  ): RequestInsight {
    const requestId = identity.requestId!
    const insightKey = getRequestInsightKey({
      requestId,
      kind: identity.kind,
    })
    let insight = this.requests.get(insightKey)

    if (!insight) {
      insight = {
        requestId,
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
    this.updateClassification(insight, identity)
    insight.route = insight.route ?? identity.route
    insight.url = insight.url ?? sanitizeUrl(identity.url)
    insight.startTime = Math.min(insight.startTime, startTime)

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

  private complete(insight: RequestInsight, completedAt: number): void {
    if (insight.completedAt !== undefined) {
      return
    }

    const insightKey = getRequestInsightKey(insight)
    insight.completedAt = completedAt
    this.completedRequestOrder.push(insightKey)
    appendCompletedRequestInsight(insight)

    const requestIndex = this.requestOrder.indexOf(insightKey)
    if (requestIndex !== -1) {
      this.requestOrder.splice(requestIndex, 1)
      this.requestOrder.push(insightKey)
    }

    while (
      this.completedRequestOrder.length > MAX_LIVE_COMPLETED_REQUEST_INSIGHTS
    ) {
      const completedInsightKey = this.completedRequestOrder.shift()
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

function appendCompletedRequestInsight(insight: RequestInsight): void {
  if (process.env.__NEXT_DEV_SERVER) {
    if (process.env.__NEXT_REQUEST_INSIGHTS) {
      getRequestInsightsHistoryProvider()?.append(insight)
    }
  } else {
    return
  }
}

export function configureRequestInsightsHistoryProvider(
  provider: RequestInsightsHistoryProvider
): void {
  const globalStore = globalThis as typeof globalThis & {
    [REQUEST_INSIGHTS_HISTORY_PROVIDER_KEY]?: RequestInsightsHistoryProvider
  }
  globalStore[REQUEST_INSIGHTS_HISTORY_PROVIDER_KEY] = provider
}

export function clearRequestInsightsHistoryProvider(): void {
  const globalStore = globalThis as typeof globalThis & {
    [REQUEST_INSIGHTS_HISTORY_PROVIDER_KEY]?: RequestInsightsHistoryProvider
  }
  delete globalStore[REQUEST_INSIGHTS_HISTORY_PROVIDER_KEY]
}

export async function getRequestInsightsHistory(
  query: RequestInsightsHistoryQuery = {}
): Promise<RequestInsightsHistoryPage | undefined> {
  return getRequestInsightsHistoryProvider()?.getHistory(query)
}

export async function readRequestInsightsHistory(
  query: RequestInsightsJournalQuery = {}
): Promise<RequestInsight[]> {
  return (await getRequestInsightsHistoryProvider()?.read(query)) ?? []
}

function getRequestInsightsHistoryProvider():
  | RequestInsightsHistoryProvider
  | undefined {
  const globalStore = globalThis as typeof globalThis & {
    [REQUEST_INSIGHTS_HISTORY_PROVIDER_KEY]?: RequestInsightsHistoryProvider
  }
  return globalStore[REQUEST_INSIGHTS_HISTORY_PROVIDER_KEY]
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
  const spans = batch.spans.filter(shouldRecordRequestInsightSpan)
  const importedSpanIds = new Map<string, string>()

  for (const span of spans) {
    if (span.traceId && span.spanId) {
      importedSpanIds.set(
        getSpanIdentity(span.traceId, span.spanId),
        createLocalSpanId(parent.spanId)
      )
    }
  }

  getRequestInsightsStore().recordSpans(
    spans.map((span) => {
      const importedSpanId =
        span.traceId && span.spanId
          ? importedSpanIds.get(getSpanIdentity(span.traceId, span.spanId))
          : undefined
      const importedParentSpanId =
        span.traceId && span.parentSpanId
          ? importedSpanIds.get(
              getSpanIdentity(span.traceId, span.parentSpanId)
            )
          : undefined

      return {
        ...span,
        traceId: parent.traceId,
        spanId: importedSpanId ?? createLocalSpanId(parent.spanId),
        parentSpanId: importedParentSpanId ?? parent.spanId,
        requestId: identity.requestId,
        requestInsightKind: identity.kind,
        requestInsightSource: identity.source,
        requestInsightProxyStatus: identity.proxyStatus,
        htmlRequestId: identity.htmlRequestId,
        url: identity.url,
        links: span.links?.map((link) => {
          const importedLinkSpanId = importedSpanIds.get(
            getSpanIdentity(link.traceId, link.spanId)
          )
          return importedLinkSpanId
            ? {
                ...link,
                traceId: parent.traceId,
                spanId: importedLinkSpanId,
              }
            : link
        }),
      }
    })
  )
}

function getSpanIdentity(traceId: string, spanId: string): string {
  return `${traceId}:${spanId}`
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

function getSourceFromSpan(
  span: SpanStoreRecord | undefined
): RequestInsightSource | undefined {
  if (!span) {
    return undefined
  }

  const spanType = getStringAttribute(span.attributes?.['next.span_type'])
  const markedSource = getStringAttribute(
    span.attributes?.['next.request_source']
  )
  if (markedSource === 'image' || markedSource === 'asset') {
    return markedSource
  }

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
  attributes: SpanStoreRecord['attributes']
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
    if (!SAFE_SPAN_ATTRIBUTE_KEYS.has(key)) {
      continue
    }

    sanitized[key] =
      key === 'http.url'
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
