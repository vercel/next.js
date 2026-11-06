import { reporter } from './report'
import type {
  SpanId,
  TraceEvent,
  TraceState,
  ToolingSpanSelection,
} from './types'
import type { ReportingRecord } from './otel-reporting'
import type {
  AttributeValue,
  Span as OpenTelemetrySpan,
} from '@opentelemetry/api'

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
const NUM_OF_SEC_IN_NANOSEC = BigInt('1000000000')
const NUM_OF_MILLISEC_IN_NANOSEC = BigInt('1000000')

let count = 0
const getId = () => {
  count++
  return count
}
let defaultParentSpanId: SpanId | undefined
let shouldSaveTraceEvents: boolean | undefined
let savedTraceEvents: TraceEvent[] = []
let savedToolingSpanSelections: ToolingSpanSelection[] = []

const RECORD_SPAN_THRESHOLD_MS = parseInt(
  process.env.NEXT_TRACE_SPAN_THRESHOLD_MS ?? '-1'
)

interface Attributes {
  [key: string]: unknown
}

/** Adapt tooling payloads to the existing local recorder's attribute types. */
export function normalizeToolingAttributes(
  attributes: Attributes | undefined
): Record<string, AttributeValue> {
  const entries: [string, AttributeValue][] = []
  for (const key of Object.keys(attributes ?? {})) {
    try {
      const value = attributes![key]
      if (value === null || value === undefined) continue
      if (isToolingAttributeValue(value)) {
        entries.push([key, value])
      } else {
        const encoded = JSON.stringify(value)
        if (encoded !== undefined) entries.push([key, encoded])
      }
    } catch {
      // Diagnostics must not interrupt the work being measured. Cyclic values,
      // bigint payloads and throwing serializers cannot become OTel attributes.
    }
  }
  return Object.fromEntries(entries)
}

function isToolingAttributeValue(value: unknown): value is AttributeValue {
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return true
  if (!Array.isArray(value)) return false
  const elementType = typeof value.find((element) => element != null)
  return value.every(
    (element) =>
      element == null ||
      ((elementType === 'string' ||
        elementType === 'number' ||
        elementType === 'boolean') &&
        typeof element === elementType)
  )
}

// Direct local subscriber: the reporters consume the original tooling schema,
// independently of request diagnostics and the optional application SDK adapter.
export function reportToolingSpans(events: readonly TraceEvent[]): void {
  for (const event of events) reporter.report(event)
}

export type LocalSpanTiming = {
  startTime?: import('@opentelemetry/api').SpanOptions['startTime']
  monotonicStartTime?: bigint
  wallStartTimeMs?: number
}

// Source identity and clocks only: the local recorder owns the mutable payload
// and end-once state. The reporting adapter releases its descriptor's heavy data.
export type ToolingSpanSource = {
  id: SpanId
  parentId?: SpanId
  startTime: bigint
  wallStartTimeMs: number
  reporting?: ReportingRecord
  // Nearest selected ancestor; unselected fine spans create no descriptor.
  reportingParent?: ReportingRecord
  reportingParentId?: SpanId
  recordSpans?: import('../server/lib/trace/local-span-recorder').LocalSpanDelivery
}

export function captureToolingSpanSource(
  options: LocalSpanTiming & { parent?: SpanId | null },
  parent?: ToolingSpanSource
): ToolingSpanSource {
  const time = options.startTime
  let epochMs: number | undefined
  if (time instanceof Date) {
    epochMs = time.getTime()
  } else if (Array.isArray(time)) {
    epochMs = time[0] * 1000 + time[1] / 1_000_000
  } else if (typeof time === 'number') {
    if (time < performance.timeOrigin / 2) {
      epochMs = performance.timeOrigin + time
    } else {
      epochMs = time
    }
  }
  const monotonicStartTime =
    options.monotonicStartTime ??
    (epochMs === undefined
      ? process.hrtime.bigint()
      : epochMillisecondsToNanoseconds(epochMs) +
        process.hrtime.bigint() -
        BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC)
  return {
    id: getId(),
    parentId:
      options.parent === null
        ? undefined
        : (options.parent ?? parent?.id ?? defaultParentSpanId),
    startTime: monotonicStartTime,
    wallStartTimeMs: options.wallStartTimeMs ?? epochMs ?? Date.now(),
    reportingParent: parent?.reporting ?? parent?.reportingParent,
    reportingParentId: parent?.reportingParentId,
  }
}

/** Called only by finite coarse Next tracer operations, never by local helpers. */
export function selectToolingSpanSource(source: ToolingSpanSource): void {
  if (shouldSaveTraceEvents) {
    savedToolingSpanSelections.push({
      id: source.id,
      parentId: source.reportingParentId ?? source.parentId,
    })
  }
  source.reportingParentId = source.id
}

/** Existing end() accepts this lossless monotonic representation. */
export function toolingSpanTime(time: bigint): [number, number] {
  return [
    Number(time / NUM_OF_SEC_IN_NANOSEC),
    Number(time % NUM_OF_SEC_IN_NANOSEC),
  ]
}

// Multiply integer milliseconds as bigint so epoch magnitudes cannot lose the
// low nanoseconds before the clock correction is applied.
function epochMillisecondsToNanoseconds(time: number): bigint {
  const whole = Math.trunc(time)
  return (
    BigInt(whole) * NUM_OF_MILLISEC_IN_NANOSEC +
    BigInt(Math.trunc((time - whole) * 1_000_000))
  )
}

export function completeToolingSpan(
  source: ToolingSpanSource,
  name: string,
  attributes: Record<string, AttributeValue>,
  endTime?: Parameters<OpenTelemetrySpan['end']>[0]
): TraceEvent {
  let end: bigint
  if (Array.isArray(endTime)) {
    end = BigInt(endTime[0]) * NUM_OF_SEC_IN_NANOSEC + BigInt(endTime[1])
  } else if (endTime === undefined) {
    end = process.hrtime.bigint()
  } else {
    const epochMs = endTime instanceof Date ? endTime.getTime() : endTime
    const correction =
      process.hrtime.bigint() - BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC
    const timeMs =
      epochMs < performance.timeOrigin / 2
        ? performance.timeOrigin + epochMs
        : epochMs
    end = epochMillisecondsToNanoseconds(timeMs) + correction
  }
  const duration = (end - source.startTime) / NUM_OF_MICROSEC_IN_NANOSEC
  if (duration > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Duration is too long to express as float64: ${duration}`)
  }
  const event: TraceEvent = {
    name,
    id: source.id,
    parentId: source.parentId,
    timestamp: Number(source.startTime / NUM_OF_MICROSEC_IN_NANOSEC),
    duration: Number(duration),
    startTime: source.wallStartTimeMs,
    tags: attributes,
  }
  try {
    if (duration > RECORD_SPAN_THRESHOLD_MS * 1000) {
      reportToolingSpans([event])
      if (shouldSaveTraceEvents) savedTraceEvents.push(event)
    }
  } finally {
    if (source.reporting) {
      otel?.stopSpan(source.reporting, end, attributes)
    } else if (name === 'client-hmr-latency') {
      // One selected completed browser observation, not promotion of all fine
      // local spans. Local delivery above keeps its original fields and timing.
      otel?.replayCompletedSpan(
        event,
        source.startTime,
        end,
        source.reportingParent,
        source.reportingParentId ?? source.parentId
      )
    }
  }
  return event
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
  ...(shouldSaveTraceEvents
    ? { toolingSpanSelections: savedToolingSpanSelections.slice() }
    : {}),
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
  savedToolingSpanSelections = []
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

export function recordTraceEvents(
  events: TraceEvent[],
  selections?: readonly ToolingSpanSelection[]
) {
  for (const traceEvent of events) {
    traceEvent.tags = normalizeToolingAttributes(traceEvent.tags)
    reportToolingSpans([traceEvent])
    if (traceEvent.id > count) {
      count = traceEvent.id + 1
    }
  }
  if (shouldSaveTraceEvents) {
    savedTraceEvents.push(...events)
  }
  // Imported observations are local-only unless the coarse Next tracer
  // explicitly supplies reporting selection/parent metadata.
  if (selections?.length) otel?.replayWorkerEvents(events, selections)
}

export const clearTraceEvents = () => {
  savedToolingSpanSelections = []
  return (savedTraceEvents = [])
}

/**
 * Converts hrtime (process.hrtime.bigint()) to epoch-based nanoseconds.
 *
 * hrtime values are relative to an arbitrary point in the past, while
 * epoch-based times are nanoseconds since Unix epoch (Jan 1, 1970).
 *
 * This is useful when passing hrtime values to APIs that expect epoch-based times,
 * such as completed observations passed to recordSpans().
 */
export function hrtimeToEpochNanoseconds(hrtimeValue: bigint): bigint {
  const offset =
    BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC - process.hrtime.bigint()
  return hrtimeValue + offset
}
