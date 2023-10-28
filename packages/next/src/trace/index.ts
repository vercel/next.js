import {
  trace,
  exportTraceState,
  flushAllTraces,
  getTraceEvents,
  initializeTraceState,
  recordTracesFromWorker,
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
  recordTracesFromWorker,
  Span,
  setGlobal,
  SpanStatus,
}
export type { SpanId, TraceEvent, TraceState }
