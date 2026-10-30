import { reporter } from './report'
import { LocalSpan, emitLocalSpans } from '../shared/lib/local-span'
import type { SpanId, TraceEvent, TraceState } from './types'
import type { ReportingRecord } from './otel-reporting'

let otel: typeof import('./otel') | undefined
if (
  process.env.NEXT_RUNTIME !== 'edge' &&
  process.env.NEXT_EXPERIMENTAL_OTEL_TOOLING === '1'
) {
  otel = require('./otel') as typeof import('./otel')
} else {
  otel = undefined
}

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
  [key: string]: unknown
}

// Direct local subscriber: the reporters consume the original tooling schema,
// independently of request diagnostics and the optional deferred SDK adapter.
function reportToolingSpans(events: readonly TraceEvent[]): void {
  for (const event of events) reporter.report(event)
}

export class Span extends LocalSpan<
  Attributes,
  bigint,
  bigint | undefined,
  TraceEvent
> {
  private reporting?: ReportingRecord
  private id: SpanId
  private parentId?: SpanId
  private now: number

  constructor({
    name,
    parentId,
    attrs,
    startTime,
    wallStartTimeMs,
    reportingParent,
    reportingRoot,
  }: {
    name: string
    parentId?: SpanId
    startTime?: bigint
    // Wall-clock start time in milliseconds since epoch, matching `startTime`.
    // Defaults to the construction time.
    wallStartTimeMs?: number
    attrs?: Attributes
    reportingParent?: ReportingRecord
    // Internal entry-point marker: reserves the coordinator root descriptor.
    reportingRoot?: boolean
  }) {
    super(
      name,
      attrs ? { ...attrs } : {},
      startTime || process.hrtime.bigint(),
      reportToolingSpans
    )
    this.id = getId()
    this.parentId = parentId ?? defaultParentSpanId
    // hrtime cannot be used to reconstruct tracing span's actual start time
    // since it does not have relation to clock time:
    // `These times are relative to an arbitrary time in the past, and not related to the time of day and therefore not subject to clock drift`
    // https://nodejs.org/api/process.html#processhrtimetime
    // Capturing current datetime as additional metadata for external reconstruction.
    this.now = wallStartTimeMs ?? Date.now()
    this.reporting = otel?.startSpan({
      name,
      id: this.id,
      parentId: this.parentId,
      startTime: this.startTime,
      reportingParent,
      reportingRoot,
    })
  }

  // Durations are reported as microseconds. This gives 1000x the precision
  // of something like Date.now(), which reports in milliseconds.
  // Additionally, ~285 years can be safely represented as microseconds as
  // a float64 in both JSON and JavaScript.
  stop(stopTime?: bigint) {
    this.finish(stopTime)
  }

  protected onEnd(stopTime: bigint | undefined): void {
    const end: bigint = stopTime || process.hrtime.bigint()
    const duration = (end - this.startTime) / NUM_OF_MICROSEC_IN_NANOSEC
    if (duration > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Duration is too long to express as float64: ${duration}`)
    }
    const timestamp = this.startTime / NUM_OF_MICROSEC_IN_NANOSEC
    const traceEvent: TraceEvent = {
      name: this.name,
      duration: Number(duration),
      timestamp: Number(timestamp),
      id: this.id,
      parentId: this.parentId,
      tags: this.attributes,
      startTime: this.now,
    }
    try {
      if (duration > RECORD_SPAN_THRESHOLD_MS * 1000) {
        this.emit(traceEvent)
        if (shouldSaveTraceEvents) {
          savedTraceEvents.push(traceEvent)
        }
      }
    } finally {
      otel?.stopSpan(this.reporting, end, this.attributes)
    }
  }

  traceChild(name: string, attrs?: Attributes) {
    return new Span({
      name,
      parentId: this.id,
      attrs,
      reportingParent: this.reporting,
    })
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
      reportingParent: this.reporting,
      startTime: startTime ? startTime + correction : process.hrtime.bigint(),
      // The span is constructed when the event is recorded, which may be long
      // after the work started (e.g. compilation events forwarded from
      // Turbopack), so derive the wall-clock start from the given epoch time.
      wallStartTimeMs: startTime
        ? Number(startTime / NUM_OF_MILLISEC_IN_NANOSEC)
        : undefined,
    })
    span.stop(stopTime ? stopTime + correction : process.hrtime.bigint())
  }

  getId() {
    return this.id
  }

  setAttribute(key: string, value: unknown) {
    this.setLocalAttribute(key, value)
  }

  traceFn<T>(fn: (span: Span) => T): T {
    try {
      return fn(this)
    } catch (e) {
      this.setAttribute('failed', true)
      throw e
    } finally {
      this.stop()
    }
  }

  async traceAsyncFn<T>(fn: (span: Span) => T | Promise<T>): Promise<T> {
    try {
      return await fn(this)
    } catch (e) {
      this.setAttribute('failed', true)
      throw e
    } finally {
      this.stop()
    }
  }
}

export const trace = (
  name: string,
  parentId?: SpanId,
  attrs?: { [key: string]: unknown },
  reportingRoot = false
) => {
  return new Span({ name, parentId, attrs, reportingRoot })
}

export const flushAllTraces = () => reporter.flushAll()

/**
 * Flush and release the trace file handle. Intended for tests that need to
 * delete the directory holding the trace afterwards.
 */
export const closeAllTraces = () => reporter.close()

// This code supports workers by serializing the state of tracers when the
// worker is initialized, and serializing the trace events from the worker back
// to the main process to record when the worker is complete.
export const exportTraceState = (): TraceState => ({
  defaultParentSpanId,
  lastId: count,
  shouldSaveTraceEvents,
  ...(otel
    ? {
        otelClockOffset: otel.getClockOffset(),
      }
    : {}),
})
export const initializeTraceState = (state: TraceState) => {
  count = state.lastId
  defaultParentSpanId = state.defaultParentSpanId
  shouldSaveTraceEvents = state.shouldSaveTraceEvents
  if (otel) {
    otel.configureState(
      defaultParentSpanId,
      !!shouldSaveTraceEvents,
      state.otelClockOffset
    )
  }
}

export function getTraceEvents(): TraceEvent[] {
  return savedTraceEvents
}

export function recordTraceEvents(events: TraceEvent[]) {
  if (otel) events = otel.freshWorkerEvents(events)
  for (const traceEvent of events) {
    emitLocalSpans([traceEvent], reportToolingSpans)
    if (traceEvent.id > count) {
      count = traceEvent.id + 1
    }
  }
  if (shouldSaveTraceEvents) {
    savedTraceEvents.push(...events)
  }
  otel?.replayWorkerEvents(events)
}

export const clearTraceEvents = () => (savedTraceEvents = [])

/**
 * Converts hrtime (process.hrtime.bigint()) to epoch-based nanoseconds.
 *
 * hrtime values are relative to an arbitrary point in the past, while
 * epoch-based times are nanoseconds since Unix epoch (Jan 1, 1970).
 *
 * This is useful when passing hrtime values to APIs that expect epoch-based times,
 * such as Span.manualTraceChild().
 */
export function hrtimeToEpochNanoseconds(hrtimeValue: bigint): bigint {
  const offset =
    BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC - process.hrtime.bigint()
  return hrtimeValue + offset
}
