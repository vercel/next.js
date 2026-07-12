import type { AttributeValue } from 'next/dist/compiled/@opentelemetry/api'

export type RequestInsightSpan = {
  name: string
  startTime: number
  durationMs?: number
  status?: 'ok' | 'error'
  traceId?: string
  spanId?: string
  parentSpanId?: string
  attributes?: Record<string, AttributeValue>
  links?: Array<{
    traceId: string
    spanId: string
    attributes?: Record<string, AttributeValue>
  }>
  events?: Array<{
    name: string
    timestamp: number
    attributes?: Record<string, AttributeValue>
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
