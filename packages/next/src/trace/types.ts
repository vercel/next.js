export type SpanId = number

export interface TraceState {
  lastId: number
  defaultParentSpanId?: SpanId
  shouldSaveTraceEvents?: boolean
}

export type TraceEvent = {
  traceId?: string
  parentId?: SpanId
  name: string
  id: SpanId
  timestamp: number
  duration: number
  tags?: Object
  startTime?: number
}
