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

export type RequestInsightIdentity = Readonly<{
  requestId: string
  kind?: RequestInsightKind
  source?: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
}>

type RequestInsightAttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>

export type RequestInsightSpan = {
  name: string
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
  url?: string
  method?: string
  statusCode?: number
  startTime?: number
  durationMs?: number
  cacheStatus?: string
  cacheReason?: string
  index?: number
}

export type RequestInsightRscPayloadBoundary = {
  /** `<project-relative module path>#<export name>` */
  name: string
  instances: number
  /** Estimated bytes of the props data owned by all instances combined. */
  bytes: number
  /** Estimated owned bytes of the largest single instance. */
  largestInstanceBytes: number
}

/**
 * Estimated size of the RSC (Flight) payload a request sent to the browser,
 * measured in development with React's dev-only debug metadata removed. Other
 * development overhead (e.g. longer module ids) remains, so this is not the
 * production transfer size. Only aggregates and module identifiers are
 * stored, never payload contents.
 */
export type RequestInsightRscPayload = {
  status: 'complete' | 'incomplete' | 'unavailable'
  unavailableReason?: 'too-large' | 'parse-error'
  /** Uncompressed bytes, excluding React's dev-only debug metadata. */
  estimatedBytes?: number
  /** Top Client Component boundaries by owned bytes, descending. */
  boundaries?: RequestInsightRscPayloadBoundary[]
  /** Owned bytes of application boundaries not listed in `boundaries`. */
  otherBoundariesBytes?: number
  /** Owned bytes of Next.js-internal Client Component boundaries. */
  frameworkBoundariesBytes?: number
  /**
   * Bytes of data referenced by more than one boundary instance, or by both a
   * boundary and non-boundary content.
   */
  sharedBytes?: number
}

export type RequestInsight = {
  requestId: string
  kind?: RequestInsightKind
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
  rscPayload?: RequestInsightRscPayload
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

export const MAX_LIVE_COMPLETED_REQUEST_INSIGHTS = 100

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

export function getRequestInsightKind(
  insight: Pick<RequestInsightIdentity, 'kind'>
): RequestInsightKind {
  return insight.kind ?? 'request'
}

export function getRequestInsightSource(
  insight: Pick<RequestInsightIdentity, 'kind' | 'source'>
): RequestInsightSource {
  if (getRequestInsightKind(insight) === 'instant-insights') {
    return 'instant-insights'
  }
  return insight.source ?? 'unknown'
}

export function getRequestInsightKey(insight: RequestInsightIdentity): string {
  return `${getRequestInsightKind(insight)}:${insight.requestId}`
}
