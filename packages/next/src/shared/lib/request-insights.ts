export type RequestInsightKind = 'request' | 'instant-insights'

export const REQUEST_INSIGHT_REQUEST_SPAN_TYPE = 'BaseServer.handleRequest'
export const REQUEST_INSIGHT_PROXY_SPAN_TYPE = 'Middleware.execute'

export const REQUEST_INSIGHT_SOURCES = [
  'page',
  'app-route',
  'pages-api',
  'image',
  'asset',
  'proxy',
  'instant-insights',
  'unknown',
] as const

export type RequestInsightSource = (typeof REQUEST_INSIGHT_SOURCES)[number]
export type RequestInsightProxyStatus = 'matched' | 'bypassed'

type RequestInsightAttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>

export type RequestInsightSpanCategory =
  | 'nextjs'
  | 'application'
  | 'opentelemetry'

export function getRequestInsightSpanCategory(span: {
  category?: RequestInsightSpanCategory
  attributes?: Record<string, RequestInsightAttributeValue>
}): RequestInsightSpanCategory {
  if (span.category) {
    return span.category
  }

  // The attribute is public, so it can only claim the categories Next.js
  // spans use. 'opentelemetry' comes from the recorder alone.
  const category = span.attributes?.['next.span_category']
  if (category === 'nextjs' || category === 'application') {
    return category
  }

  const spanType = span.attributes?.['next.span_type']
  return typeof spanType === 'string' && spanType !== 'AppRender.fetch'
    ? 'nextjs'
    : 'application'
}

export type RequestInsightSpan = {
  name: string
  category: RequestInsightSpanCategory
  startTime: number
  durationMs?: number
  status?: 'ok' | 'error'
  traceId?: string
  spanId?: string
  parentSpanId?: string
  attributes?: Record<string, RequestInsightAttributeValue>
  links?: Array<{
    traceId: string
    spanId: string
    attributes?: Record<string, RequestInsightAttributeValue>
  }>
  events?: Array<{
    name: string
    timestamp: number
    attributes?: Record<string, RequestInsightAttributeValue>
  }>
  error?: {
    type?: string
    message?: string
  }
}

export type RequestInsightFetch = {
  parentSpanId?: string
  url?: string
  method?: string
  statusCode?: number
  startTime?: number
  durationMs?: number
  cacheStatus?: string
  cacheReason?: string
  index?: number
}

// Instant Insights validates another request, so it must name that request.
export type RequestInsightRelation =
  | {
      kind?: Exclude<RequestInsightKind, 'instant-insights'>
      parentRequestId?: undefined
    }
  | { kind: 'instant-insights'; parentRequestId: string }

export type RequestInsight = RequestInsightRelation & {
  requestId: string
  source: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  htmlRequestId: string
  route?: string
  url?: string
  startTime: number
  durationMs?: number
  completedAt?: number
  status: 'ok' | 'error' | 'pending'
  spans: RequestInsightSpan[]
  fetches: RequestInsightFetch[]
}

export type RequestInsightsSnapshot = {
  requests: RequestInsight[]
}

export type RequestInsightDelta = RequestInsight & {
  spanOffset: number
  fetchOffset: number
}

const MAX_REQUEST_INSIGHT_DELTA_RECORDS = 128

export function createRequestInsightDelta(
  request: RequestInsight,
  spanOffset: number,
  fetchOffset: number
): RequestInsightDelta {
  const spans = request.spans.slice(
    spanOffset,
    spanOffset + MAX_REQUEST_INSIGHT_DELTA_RECORDS
  )
  return {
    ...request,
    spanOffset,
    fetchOffset,
    spans,
    fetches: request.fetches.slice(
      fetchOffset,
      fetchOffset + MAX_REQUEST_INSIGHT_DELTA_RECORDS - spans.length
    ),
  }
}

export const MAX_LIVE_COMPLETED_REQUEST_INSIGHTS = 500

export function isSameRequestInsightFetch(
  first: RequestInsightFetch,
  second: RequestInsightFetch
): boolean {
  return (
    first.url === second.url &&
    (first.index !== undefined && second.index !== undefined
      ? first.index === second.index
      : first.startTime === second.startTime)
  )
}

export function getRequestInsightKind(insight: {
  kind?: RequestInsightKind
}): RequestInsightKind {
  return insight.kind ?? 'request'
}

export function getRequestInsightSource(insight: {
  kind?: RequestInsightKind
  source?: RequestInsightSource
}): RequestInsightSource {
  if (getRequestInsightKind(insight) === 'instant-insights') {
    return 'instant-insights'
  }
  return insight.source ?? 'unknown'
}

/**
 * Whether `insight` describes the request with `requestId`: the request itself
 * or an Instant Insights entry that validated it.
 */
export function isRequestInsightFor(
  insight: Pick<RequestInsight, 'requestId' | 'parentRequestId'>,
  requestId: string
): boolean {
  return (
    insight.requestId === requestId || insight.parentRequestId === requestId
  )
}
