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
