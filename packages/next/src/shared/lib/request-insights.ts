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
}

export type RequestInsightsSnapshot = {
  requests: RequestInsight[]
}

export const MAX_LIVE_COMPLETED_REQUEST_INSIGHTS = 100

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
