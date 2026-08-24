import type { RequestInsightKind } from '../../../next-devtools/shared/request-insights'
import type {
  RequestInsightProxyStatus,
  RequestInsightSource,
} from '../../../shared/lib/request-insights'
import { getOrCreateGlobalAsyncLocalStorage } from '../../app-render/async-local-storage'

export type SpanStoreAttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>

export type SpanStoreAttributes = Record<string, SpanStoreAttributeValue>

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

export type LocalSpanParent = {
  traceId: string
  spanId: string
}

export type LocalSpanBatch = {
  spans: SpanStoreRecord[]
  droppedSpanCount: number
}

type SpanRecorderForTest = (span: SpanStoreRecord) => void
type LocalSpanSink = (span: SpanStoreRecord) => void

let spanRecorderForTest: SpanRecorderForTest | undefined

function getLocalSpanSinkStorage() {
  return getOrCreateGlobalAsyncLocalStorage<LocalSpanSink>('local-span-sink')
}

export function runWithLocalSpanSink<T>(sink: LocalSpanSink, fn: () => T): T {
  return getLocalSpanSinkStorage().run(sink, fn)
}

export function isLocalSpanSinkActive(): boolean {
  return getLocalSpanSinkStorage().getStore() !== undefined
}

export function recordSpan(record: Omit<SpanStoreRecord, 'timestamp'>): void {
  if (!isLocalSpanRecordingEnabled()) {
    return
  }

  const spanRecord: SpanStoreRecord = {
    timestamp: getCurrentTimestamp(),
    ...record,
  }

  const localSpanSink = getLocalSpanSinkStorage().getStore()
  localSpanSink?.(spanRecord)
  spanRecorderForTest?.(spanRecord)

  if (!localSpanSink && isRequestInsightsEnabled() && spanRecord.requestId) {
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

  return (
    isLocalSpanSinkActive() ||
    spanRecorderForTest !== undefined ||
    isRequestInsightsEnabled()
  )
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

function getCurrentTimestamp(): number {
  return performance.timeOrigin + performance.now()
}
