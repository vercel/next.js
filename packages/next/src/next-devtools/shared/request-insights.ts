import type {
  RequestInsightKind,
  RequestInsightProxyStatus,
  RequestInsightSource,
} from '../../shared/lib/request-insights'

export {
  getRequestInsightKey,
  getRequestInsightKind,
  getRequestInsightSource,
  type RequestInsightIdentity,
  type RequestInsightKind,
  type RequestInsightProxyStatus,
  type RequestInsightSource,
} from '../../shared/lib/request-insights'

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
  status: 'ok' | 'error' | 'pending'
  spans: RequestInsightSpan[]
  fetches: RequestInsightFetch[]
}

export type RequestInsightsSnapshot = {
  requests: RequestInsight[]
}
