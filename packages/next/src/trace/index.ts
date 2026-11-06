import {
  exportTraceState,
  flushAllTraces,
  getTraceEvents,
  initializeTraceState,
  recordTraceEvents,
  hrtimeToEpochNanoseconds,
} from './trace'
import { setGlobal } from './shared'
import type { SpanId, TraceEvent, TraceState } from './types'

export {
  exportTraceState,
  flushAllTraces,
  getTraceEvents,
  hrtimeToEpochNanoseconds,
  initializeTraceState,
  recordTraceEvents,
  setGlobal,
}
export type { SpanId, TraceEvent, TraceState }
