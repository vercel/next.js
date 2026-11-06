export type SpanId = number

export type ToolingSpanSelection = {
  id: SpanId
  // External topology only; TraceEvent.parentId keeps the full local hierarchy.
  parentId?: SpanId
}

export interface TraceState {
  lastId: number
  defaultParentSpanId?: SpanId
  shouldSaveTraceEvents?: boolean
  /** Shared monotonic-to-epoch mapping for app-tracer worker replay. */
  otelClockOffset?: string
  /** Internal worker sidecar, never written to legacy trace files. */
  toolingSpanSelections?: readonly ToolingSpanSelection[]
}

export type TraceEvent = {
  traceId?: string
  parentId?: SpanId
  name: string
  id: SpanId
  timestamp: number
  duration: number
  tags?: Record<string, unknown>
  startTime?: number
}
