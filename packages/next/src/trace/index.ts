import {
  trace,
  flushAllTraces,
  getTraceEvents,
  Span,
  SpanStatus,
} from './trace'
import { setGlobal } from './shared'
import type { SpanId, TraceEvent } from './types'

export { trace, flushAllTraces, getTraceEvents, Span, setGlobal, SpanStatus }
export type { SpanId, TraceEvent }
