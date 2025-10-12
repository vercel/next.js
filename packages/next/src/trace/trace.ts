import { reporter } from './report'
import type { SpanId, TraceEvent, TraceState } from './types'

const NUM_OF_MICROSEC_IN_NANOSEC = BigInt('1000')
const NUM_OF_MILLISEC_IN_NANOSEC = BigInt('1000000')
let count = 0
const getId = () => {
  count++
  return count
}
let defaultParentSpanId: SpanId | undefined
let shouldSaveTraceEvents: boolean | undefined
let savedTraceEvents: TraceEvent[] = []

const RECORD_SPAN_THRESHOLD_MS = parseInt(
  process.env.NEXT_TRACE_SPAN_THRESHOLD_MS ?? '-1'
)

// eslint typescript has a bug with TS enums
export enum SpanStatus {
  Started = 'started',
  Stopped = 'stopped',
}

interface Attributes {
  [key: string]: string
}

export class Span {
  private name: string
  private id: SpanId
  private parentId?: SpanId
  private attrs: { [key: string]: any }
  private status: SpanStatus
  private now: number

  // Number of nanoseconds since epoch.
  private _start: bigint

  constructor({
    name,
    parentId,
    attrs,
    startTime,
  }: {
    name: string
    parentId?: SpanId
    startTime?: bigint
    attrs?: Attributes
  }) {
    this.name = name
    this.parentId = parentId ?? defaultParentSpanId
    this.attrs = attrs ? { ...attrs } : {}

    this.status = SpanStatus.Started
    this.id = getId()
    this._start = startTime || process.hrtime.bigint()
    // hrtime cannot be used to reconstruct tracing span's actual start time
    // since it does not have relation to clock time:
    // `These times are relative to an arbitrary time in the past, and not related to the time of day and therefore not subject to clock drift`
    // https://nodejs.org/api/process.html#processhrtimetime
    // Capturing current datetime as additional metadata for external reconstruction.
    this.now = Date.now()
  }

  // Durations are reported as microseconds. This gives 1000x the precision
  // of something like Date.now(), which reports in milliseconds.
  // Additionally, ~285 years can be safely represented as microseconds as
  // a float64 in both JSON and JavaScript.
  stop(stopTime?: bigint) {
    if (this.status === SpanStatus.Stopped) {
      // Don't report the same span twice.
      // TODO: In the future this should throw as `.stop()` shouldn't be called multiple times.
      return
    }
    const end: bigint = stopTime || process.hrtime.bigint()
    const duration = (end - this._start) / NUM_OF_MICROSEC_IN_NANOSEC
    this.status = SpanStatus.Stopped
    if (duration > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Duration is too long to express as float64: ${duration}`)
    }
    const timestamp = this._start / NUM_OF_MICROSEC_IN_NANOSEC
    const traceEvent: TraceEvent = {
      name: this.name,
      duration: Number(duration),
      timestamp: Number(timestamp),
      id: this.id,
      parentId: this.parentId,
      tags: this.attrs,
      startTime: this.now,
    }
    if (duration > RECORD_SPAN_THRESHOLD_MS * 1000) {
      reporter.report(traceEvent)
      if (shouldSaveTraceEvents) {
        savedTraceEvents.push(traceEvent)
      }
    }
  }

  traceChild(name: string, attrs?: Attributes) {
    return new Span({ name, parentId: this.id, attrs })
  }

  manualTraceChild(
    name: string,
    // Start time in nanoseconds since epoch.
    startTime?: bigint,
    // Stop time in nanoseconds since epoch.
    stopTime?: bigint,
    attrs?: Attributes
  ) {
    // We need to convert the time info to the same base as hrtime since that is used usually.
    const correction =
      process.hrtime.bigint() - BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC
    const span = new Span({
      name,
      parentId: this.id,
      attrs,
      startTime: startTime ? startTime + correction : process.hrtime.bigint(),
    })
    span.stop(stopTime ? stopTime + correction : process.hrtime.bigint())
  }

  getId() {
    return this.id
  }

  setAttribute(key: string, value: string) {
    this.attrs[key] = value
  }

  traceFn<T>(fn: (span: Span) => T): T {
    try {
      return fn(this)
    } finally {
      this.stop()
    }
  }

  async traceAsyncFn<T>(fn: (span: Span) => T | Promise<T>): Promise<T> {
    try {
      return await fn(this)
    } finally {
      this.stop()
    }
  }
}

export const trace = (
  name: string,
  parentId?: SpanId,
  attrs?: { [key: string]: string }
) => {
  return new Span({ name, parentId, attrs })
}

export const flushAllTraces = (opts?: { end: boolean }) =>
  reporter.flushAll(opts)

// This code supports workers by serializing the state of tracers when the
// worker is initialized, and serializing the trace events from the worker back
// to the main process to record when the worker is complete.
export const exportTraceState = (): TraceState => ({
  defaultParentSpanId,
  lastId: count,
  shouldSaveTraceEvents,
})
export const initializeTraceState = (state: TraceState) => {
  count = state.lastId
  defaultParentSpanId = state.defaultParentSpanId
  shouldSaveTraceEvents = state.shouldSaveTraceEvents
}

export function getTraceEvents(): TraceEvent[] {
  return savedTraceEvents
}

export function recordTraceEvents(events: TraceEvent[]) {
  for (const traceEvent of events) {
    reporter.report(traceEvent)
    if (traceEvent.id > count) {
      count = traceEvent.id + 1
    }
  }
  if (shouldSaveTraceEvents) {
    savedTraceEvents.push(...events)
  }
}

export const clearTraceEvents = () => (savedTraceEvents = [])
