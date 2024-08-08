import {
  trace,
  exportTraceState,
  flushAllTraces,
  getTraceEvents,
  initializeTraceState,
  recordTraceEvents,
  Span,
  SpanStatus,
} from './trace'
import { setGlobal } from './shared'
import type { SpanId, TraceEvent, TraceState } from './types'

export {
  trace,
  exportTraceState,
  flushAllTraces,
  getTraceEvents,
  initializeTraceState,
  recordTraceEvents,
  Span,
  setGlobal,
  SpanStatus,
}
export type { SpanId, TraceEvent, TraceState }
