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

export type SpanStoreFilter = {
  requestId?: string
  route?: string
  name?: string
}

export type InMemorySpanStoreOptions = {
  maxRecords?: number
}

const DEFAULT_MAX_RECORDS = 128
const LOCAL_SPAN_STORE_KEY = Symbol.for('@next/local-span-store')

export class InMemorySpanStore {
  private readonly maxRecords: number
  private records: SpanStoreRecord[] = []

  constructor(options: InMemorySpanStoreOptions = {}) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS
  }

  record(record: Omit<SpanStoreRecord, 'timestamp'>): SpanStoreRecord {
    const spanRecord = {
      timestamp: Date.now(),
      ...record,
    }

    this.records.push(spanRecord)

    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords)
    }

    return spanRecord
  }

  getRecords(filter: SpanStoreFilter = {}): SpanStoreRecord[] {
    return this.records.filter(
      (record) =>
        (filter.requestId === undefined ||
          record.requestId === filter.requestId) &&
        (filter.route === undefined || record.route === filter.route) &&
        (filter.name === undefined || record.name === filter.name)
    )
  }

  clear(): void {
    this.records = []
  }
}

export function recordSpan(record: Omit<SpanStoreRecord, 'timestamp'>): void {
  if (!isLocalSpanStoreEnabled()) {
    return
  }

  getLocalSpanStore().record(record)
}

export function getSpanRecords(filter?: SpanStoreFilter): SpanStoreRecord[] {
  return getLocalSpanStore().getRecords(filter)
}

export function clearSpanStoreForTest(): void {
  getLocalSpanStore().clear()
}

export function isLocalSpanStoreEnabled(): boolean {
  if (!process.env.__NEXT_DEV_SERVER) {
    return false
  }

  const value = process.env.NEXT_OTEL_LOCAL_SPANS
  return isEnabledEnvValue(value) || isRequestInsightsEnabled()
}

export function isRequestInsightsEnabled(): boolean {
  const value = process.env.__NEXT_REQUEST_INSIGHTS
  return isEnabledEnvValue(value)
}

function isEnabledEnvValue(value: string | undefined): boolean {
  return value === '1' || value === 'true' || (value as unknown) === true
}

function getLocalSpanStore(): InMemorySpanStore {
  const globalStore = globalThis as typeof globalThis & {
    [LOCAL_SPAN_STORE_KEY]?: InMemorySpanStore
  }

  return (globalStore[LOCAL_SPAN_STORE_KEY] ??= new InMemorySpanStore())
}
