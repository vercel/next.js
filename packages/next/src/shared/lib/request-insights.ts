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

export const REQUEST_INSIGHT_ROUTER_ACTIVITIES = [
  'prefetch',
  'segment-prefetch',
  'hmr-refresh',
] as const

export type RequestInsightRouterActivity =
  (typeof REQUEST_INSIGHT_ROUTER_ACTIVITIES)[number]

export const REQUEST_INSIGHT_RETENTION_BUCKETS = [
  'page',
  'api',
  'asset',
  'proxy',
  'instant-insights',
  'unknown',
] as const

export type RequestInsightRetentionBucket =
  (typeof REQUEST_INSIGHT_RETENTION_BUCKETS)[number]

export type RequestInsightIdentity = {
  requestId: string
  rootRequestId?: string
  kind?: RequestInsightKind
  source?: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  routerActivity?: RequestInsightRouterActivity
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

export function getRequestInsightRetentionBucket(
  insight: Pick<RequestInsightIdentity, 'kind' | 'source'>
): RequestInsightRetentionBucket {
  const source = getRequestInsightSource(insight)
  if (source === 'app-route' || source === 'pages-api') {
    return 'api'
  }
  if (source === 'image' || source === 'asset') {
    return 'asset'
  }
  return source
}

export function getRequestInsightKey(insight: RequestInsightIdentity): string {
  return `${getRequestInsightKind(insight)}:${insight.requestId}`
}

export function getRequestInsightRootId(
  insight: Pick<RequestInsightIdentity, 'requestId' | 'rootRequestId'>
): string {
  return insight.rootRequestId ?? insight.requestId
}
