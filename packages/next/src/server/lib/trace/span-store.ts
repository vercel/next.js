import type { AttributeValue } from 'next/dist/compiled/@opentelemetry/api'

export type SpanStoreAttributes = Record<string, AttributeValue>

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

export function recordSpan(record: Omit<SpanStoreRecord, 'timestamp'>): void {
  if (!isLocalSpanRecordingEnabled()) {
    return
  }

  const spanRecord: SpanStoreRecord = {
    timestamp: Date.now(),
    ...record,
  }

  spanRecorderForTest?.(spanRecord)

  if (isRequestInsightsEnabled() && spanRecord.requestId) {
    const { recordRequestInsightSpan } =
      require('./request-insights') as typeof import('./request-insights')
    recordRequestInsightSpan(spanRecord)
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
  if (!process.env.__NEXT_DEV_SERVER) {
    return false
  }

  const value = process.env.__NEXT_REQUEST_INSIGHTS
  return isEnabledEnvValue(value)
}

function isEnabledEnvValue(value: string | undefined): boolean {
  return value === '1' || value === 'true' || (value as unknown) === true
}
