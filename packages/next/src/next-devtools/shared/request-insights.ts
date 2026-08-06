import type {
  RequestInsightKind,
  RequestInsightProxyStatus,
  RequestInsightRouterActivity,
  RequestInsightSource,
} from '../../shared/lib/request-insights'

export {
  getRequestInsightKey,
  getRequestInsightKind,
  getRequestInsightSource,
  REQUEST_INSIGHT_PROXY_SPAN_TYPE,
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  type RequestInsightIdentity,
  type RequestInsightKind,
  type RequestInsightProxyStatus,
  type RequestInsightRouterActivity,
  type RequestInsightSource,
} from '../../shared/lib/request-insights'

export type RequestInsightAttributeValue =
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

export type RequestInsightResponse = {
  /**
   * The time lifecycle tracking was attached to the response. This is not a
   * first-byte timestamp.
   */
  trackingStartTime: number
  endTime?: number
  statusCode?: number
  outcome: 'pending' | 'finished' | 'aborted' | 'errored'
  error?: {
    type?: string
  }
}

export type RequestInsight = {
  requestId: string
  parentRequestId?: string
  parentFetchIndex?: number
  kind?: RequestInsightKind
  source: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  routerActivity?: RequestInsightRouterActivity
  serverAction?: true
  htmlRequestId: string
  route?: string
  url?: string
  startTime: number
  durationMs?: number
  status: 'ok' | 'error' | 'aborted' | 'pending'
  response?: RequestInsightResponse
  spans: RequestInsightSpan[]
  fetches: RequestInsightFetch[]
}

export type RequestInsightsSnapshot = {
  requests: RequestInsight[]
}
