import type {
  RequestInsightAttributeValue,
  RequestInsightKind,
} from '../../../next-devtools/shared/request-insights'
import type {
  RequestInsightProxyStatus,
  RequestInsightRouterActivity,
  RequestInsightSource,
} from '../../../shared/lib/request-insights'
import type { RequestInsights } from './request-insights'

let spanStoreRequestInsightsRuntime:
  | typeof import('./request-insights-runtime')
  | undefined

function getSpanStoreRequestInsightsRuntime():
  | typeof import('./request-insights-runtime')
  | undefined {
  if (process.env.__NEXT_DEV_SERVER) {
    return (spanStoreRequestInsightsRuntime ??=
      require('./request-insights-runtime') as typeof import('./request-insights-runtime'))
  }
  return undefined
}

export type SpanStoreAttributes = Record<string, RequestInsightAttributeValue>

export type SpanStoreLink = {
  traceId: string
  spanId: string
  attributes?: SpanStoreAttributes
}

export type SpanStoreEvent = {
  name: string
  timestamp: number
  attributes?: SpanStoreAttributes
}

export type SpanStoreRecord = {
  name: string
  timestamp: number
  startTime?: number
  durationMs?: number
  status?: 'ok' | 'error'
  traceId?: string
  spanId?: string
  parentSpanId?: string
  requestId?: string
  requestInsightKind?: RequestInsightKind
  requestInsightSource?: RequestInsightSource
  requestInsightProxyStatus?: RequestInsightProxyStatus
  requestInsightRouterActivity?: RequestInsightRouterActivity
  requestInsightServerAction?: true
  htmlRequestId?: string
  route?: string
  url?: string
  attributes?: SpanStoreAttributes
  links?: SpanStoreLink[]
  events?: SpanStoreEvent[]
  error?: {
    type?: string
    message?: string
  }
}

type SpanRecorderForTest = (span: SpanStoreRecord) => void

let spanRecorderForTest: SpanRecorderForTest | undefined

export function recordSpan(
  record: Omit<SpanStoreRecord, 'timestamp'>,
  ...requestInsightsOverride: [] | [RequestInsights | undefined]
): void {
  if (!process.env.__NEXT_DEV_SERVER) {
    return
  }

  const requestInsights =
    requestInsightsOverride.length === 0
      ? getSpanStoreRequestInsightsRuntime()?.getActiveRequestInsights()
      : requestInsightsOverride[0]

  if (!spanRecorderForTest && !requestInsights) {
    return
  }

  const spanRecord: SpanStoreRecord = {
    timestamp: getCurrentTimestamp(),
    ...record,
  }

  spanRecorderForTest?.(spanRecord)

  if (requestInsights && spanRecord.requestId) {
    requestInsights.recordSpan(spanRecord)
  }
}

export function setSpanRecorderForTest(
  recorder: SpanRecorderForTest | undefined
): void {
  spanRecorderForTest = recorder
}

export function isLocalSpanRecordingEnabled(): boolean {
  if (!process.env.__NEXT_DEV_SERVER) {
    return false
  }

  return spanRecorderForTest !== undefined || isRequestInsightsEnabled()
}

export function isRequestInsightsEnabled(): boolean {
  return (
    getSpanStoreRequestInsightsRuntime()?.isRequestInsightsRuntimeActive() ??
    false
  )
}

function getCurrentTimestamp(): number {
  return performance.timeOrigin + performance.now()
}
